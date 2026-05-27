import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { fetchPokemon, formatPokemonName } from "../api/pokemonApi";
import {
  addBidHistory,
  finalizeAuction,
  joinRoom,
  startAuction
} from "../firebase/roomHelpers";
import { isAdmin } from "../config/admin";

function getBidIncrement(currentBid) {
  if (currentBid < 40) {
    return 1;
  }

  if (currentBid < 70) {
    return 2;
  }

  if (currentBid < 100) {
    return 3;
  }

  return 4;
}

function getNextBidAmount(room) {
  if (!room) {
    return 0;
  }

  if (!room.currentBid || room.currentBid === 0) {
    return room.bidStep || 10;
  }

  return room.currentBid + getBidIncrement(room.currentBid);
}

function AuctionRoom({ user, userProfile }) {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [roomError, setRoomError] = useState("");
  const [bidError, setBidError] = useState("");
  const [message, setMessage] = useState("");
  const [isBidding, setIsBidding] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const [pokemon, setPokemon] = useState(null);
  const [loadingPokemon, setLoadingPokemon] = useState(false);
  const [pokemonError, setPokemonError] = useState("");
  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [joinError, setJoinError] = useState("");
  const [joinedPlayerKey, setJoinedPlayerKey] = useState("");
  const [forfeitError, setForfeitError] = useState("");
  const [forfeitMessage, setForfeitMessage] = useState("");
  const [forfeitingPlayerId, setForfeitingPlayerId] = useState("");
  const [finalizeError, setFinalizeError] = useState("");
  const [currentUserData, setCurrentUserData] = useState(null);
  const [startError, setStartError] = useState("");
  const [isStartingAuction, setIsStartingAuction] = useState(false);
  const userIsAdmin = isAdmin(user);
  const isCurrentHighestBidder = room?.currentBidderId === user?.uid;
  const currentPlayer = players.find((player) => player.userId === user?.uid);
  const nextBidAmount = getNextBidAmount(room);
  const hasEnoughCredits = currentUserData
    ? currentUserData.credits >= nextBidAmount
    : false;
  const activePlayers = players.filter((player) => !player.forfeited);
  const onlyActivePlayerId = activePlayers[0]?.userId || "";
  const roomPokemonId = room?.pokemonId || room?.currentPokemonId;

  useEffect(() => {
    const roomRef = doc(db, "rooms", roomId);

    const unsubscribe = onSnapshot(
      roomRef,
      (roomDoc) => {
        if (roomDoc.exists()) {
          setRoom({
            id: roomDoc.id,
            ...roomDoc.data()
          });
        } else {
          setRoom(null);
        }

        setLoadingRoom(false);
      },
      (snapshotError) => {
        setRoomError(snapshotError.message);
        setLoadingRoom(false);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    if (!user) {
      setCurrentUserData(null);
      return;
    }

    const userRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(userRef, (userDoc) => {
      if (userDoc.exists()) {
        setCurrentUserData(userDoc.data());
      }
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const endAuctionAfterForfeits = async () => {
      if (!room?.auctionStarted || loadingPlayers || players.length === 0) {
        return;
      }

      const hasBid = (room.currentBid || 0) > 0;
      const everyoneForfeitedBeforeBid = !hasBid && activePlayers.length === 0;
      const highestBidderIsOnlyActivePlayer =
        hasBid &&
        players.length >= 2 &&
        activePlayers.length === 1 &&
        onlyActivePlayerId === room.currentBidderId;

      if (!everyoneForfeitedBeforeBid && !highestBidderIsOnlyActivePlayer) {
        return;
      }

      try {
        await updateDoc(doc(db, "rooms", roomId), {
          auctionStarted: false,
          auctionEnded: true
        });
      } catch (error) {
        setRoomError(error.message);
      }
    };

    endAuctionAfterForfeits();
  }, [
    activePlayers.length,
    loadingPlayers,
    onlyActivePlayerId,
    players.length,
    room?.auctionStarted,
    room?.currentBid,
    room?.currentBidderId,
    roomId
  ]);

  useEffect(() => {
    const addPlayerToRoom = async () => {
      if (!room || !user || !userProfile?.username || userIsAdmin) {
        return;
      }

      const playerKey = `${roomId}-${user.uid}`;
      if (joinedPlayerKey === playerKey) {
        return;
      }

      try {
        setJoinError("");
        await joinRoom({
          roomId,
          userId: user.uid,
          username: userProfile.username
        });
        setJoinedPlayerKey(playerKey);
      } catch (error) {
        setJoinError(error.message);
      }
    };

    addPlayerToRoom();
  }, [joinedPlayerKey, room, roomId, user, userIsAdmin, userProfile]);

  useEffect(() => {
    const playersQuery = query(
      collection(db, "rooms", roomId, "players"),
      orderBy("joinedAt", "asc")
    );

    const unsubscribe = onSnapshot(
      playersQuery,
      (snapshot) => {
        const playerList = snapshot.docs.map((playerDoc) => ({
          id: playerDoc.id,
          ...playerDoc.data()
        }));

        setPlayers(playerList);
        setLoadingPlayers(false);
      },
      (error) => {
        setJoinError(error.message);
        setLoadingPlayers(false);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    const finishAuction = async () => {
      if (!room?.auctionEnded || room.auctionFinalized) {
        return;
      }

      if (room.currentBidderId && !pokemon) {
        return;
      }

      try {
        setFinalizeError("");
        await finalizeAuction({
          roomId,
          pokemon: pokemon
            ? {
                name: formatPokemonName(pokemon.name),
                types: pokemon.types.map((type) => formatPokemonName(type))
              }
            : null
        });
      } catch (error) {
        setFinalizeError(error.message);
      }
    };

    finishAuction();
  }, [pokemon, room, roomId]);

  useEffect(() => {
    const loadPokemon = async () => {
      if (!roomPokemonId) {
        setPokemon(null);
        return;
      }

      try {
        setPokemonError("");
        setLoadingPokemon(true);
        const pokemonData = await fetchPokemon(roomPokemonId);
        setPokemon(pokemonData);
      } catch (error) {
        setPokemonError(error.message);
      } finally {
        setLoadingPokemon(false);
      }
    };

    loadPokemon();
  }, [roomPokemonId]);

  useEffect(() => {
    if (!room || !room.auctionEndTime) {
      setTimeLeft("No timer set");
      return;
    }

    const endTime = room.auctionEndTime.toDate().getTime();

    const updateTimer = async () => {
      const difference = endTime - Date.now();

      if (difference <= 0) {
        setTimeLeft("00:00");

        if (!room.auctionEnded && (room.currentBid || 0) > 0) {
          try {
            await updateDoc(doc(db, "rooms", roomId), {
              auctionStarted: false,
              auctionEnded: true
            });
          } catch (timerError) {
            setRoomError(timerError.message);
          }
        }

        return;
      }

      const minutes = Math.floor(difference / 1000 / 60);
      const seconds = Math.floor((difference / 1000) % 60);
      setTimeLeft(
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    };

    updateTimer();
    const timerId = setInterval(updateTimer, 1000);

    return () => clearInterval(timerId);
  }, [room, roomId]);

  const placeBid = async () => {
    if (userIsAdmin) {
      return;
    }

    if (isBidding || !room) {
      return;
    }

    if (room.auctionEnded) {
      setBidError("Auction has ended.");
      return;
    }

    if (!room.auctionStarted) {
      setBidError("Auction has not started yet.");
      return;
    }

    if (currentPlayer?.forfeited) {
      setBidError("You forfeited and cannot bid.");
      return;
    }

    if (isCurrentHighestBidder) {
      setBidError("Wait for another player to bid");
      return;
    }

    if (!currentPlayer) {
      setBidError("Player data is still loading.");
      return;
    }

    if (!currentUserData) {
      setBidError("User credits are still loading.");
      return;
    }

    if (!hasEnoughCredits) {
      setBidError("Not enough credits to place this bid.");
      return;
    }

    try {
      setBidError("");
      setMessage("");
      setIsBidding(true);

      const roomRef = doc(db, "rooms", roomId);

      await updateDoc(roomRef, {
        currentBid: nextBidAmount,
        currentBidderId: user.uid,
        currentBidderName: userProfile.username
      });

      await addBidHistory({
        roomId,
        bidderId: user.uid,
        bidderName: userProfile.username,
        amount: nextBidAmount
      });

      setMessage("Bid placed successfully.");
    } catch (bidError) {
      setBidError(bidError.message);
    } finally {
      setIsBidding(false);
    }
  };

  const forfeitPlayer = async (player) => {
    if (userIsAdmin) {
      return;
    }

    if (!player || forfeitingPlayerId) {
      return;
    }

    if (player.userId !== user.uid) {
      setForfeitError("You can only forfeit yourself.");
      return;
    }

    if (room.currentBidderId === player.userId) {
      setForfeitError("Highest bidder cannot forfeit.");
      return;
    }

    try {
      setForfeitError("");
      setForfeitMessage("");
      setForfeitingPlayerId(player.userId);

      await updateDoc(doc(db, "rooms", roomId, "players", player.userId), {
        forfeited: true
      });

      setForfeitMessage(`${player.username} forfeited from this auction.`);
    } catch (error) {
      setForfeitError(error.message);
    } finally {
      setForfeitingPlayerId("");
    }
  };

  const handleStartAuction = async () => {
    try {
      setStartError("");
      setIsStartingAuction(true);
      await startAuction({
        roomId,
        adminId: user.uid
      });
    } catch (error) {
      setStartError(error.message);
    } finally {
      setIsStartingAuction(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto w-full max-w-3xl">
        <Link to="/" className="text-sm font-medium text-emerald-700">
          Back to home
        </Link>

        {loadingRoom && (
          <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Loading room...</p>
          </div>
        )}

        {!loadingRoom && roomError && (
          <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
            <p className="text-sm text-red-600">{roomError}</p>
          </div>
        )}

        {!loadingRoom && !roomError && !room && (
          <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">Room not found</h1>
            <p className="mt-2 text-sm text-slate-600">
              This room does not exist in Firestore.
            </p>
          </div>
        )}

        {!loadingRoom && room && (
          <>
            <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Room
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">
                {room.roomName}
              </h1>
              <p className="mt-2 text-sm text-slate-500">Room ID: {room.roomId}</p>

              {userIsAdmin && !room.auctionStarted && !room.auctionEnded && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={handleStartAuction}
                    disabled={isStartingAuction}
                    className="rounded-md bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {isStartingAuction ? "Starting..." : "Start Auction"}
                  </button>
                  {startError && (
                    <p className="mt-3 text-sm text-red-600">{startError}</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">Pokemon</p>
                {loadingPokemon && (
                  <p className="mt-2 text-sm text-slate-600">Loading Pokemon...</p>
                )}
                {pokemonError && (
                  <p className="mt-2 text-sm text-red-600">{pokemonError}</p>
                )}
                {!loadingPokemon && !pokemonError && !roomPokemonId && (
                  <p className="mt-2 text-sm text-slate-600">
                    Pokemon ID not set for this room.
                  </p>
                )}
                {!loadingPokemon && pokemon && (
                  <div className="mt-3">
                    {pokemon.image && (
                      <img
                        src={pokemon.image}
                        alt={formatPokemonName(pokemon.name)}
                        className="h-28 w-28 object-contain"
                      />
                    )}
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatPokemonName(pokemon.name)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pokemon.types.map((type) => (
                        <span
                          key={type}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          {formatPokemonName(type)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">Current Bid</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {room.currentBid}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
              <div className="mb-5 rounded-md bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-500">Auction Timer</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {room.auctionEnded
                    ? "Auction Ended"
                    : room.auctionStarted
                      ? timeLeft
                      : "Waiting for admin to start auction"}
                </p>
              </div>

              <p className="text-sm font-medium text-slate-500">
                Current Highest Bidder
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {room.currentBidderName || "No bids yet"}
              </p>

              {room.auctionEnded && (
                <div className="mt-5 rounded-md border border-emerald-100 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-800">Auction Ended</p>
                  {room.currentBid > 0 && room.currentBidderId ? (
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      {pokemon?.image && (
                        <img
                          src={pokemon.image}
                          alt={formatPokemonName(pokemon.name)}
                          className="h-20 w-20 rounded-md bg-white object-contain"
                        />
                      )}
                      <div>
                        <p className="text-sm text-emerald-700">
                          Winner: {room.currentBidderName}
                        </p>
                        <p className="mt-1 text-sm text-emerald-700">
                          Pokemon:{" "}
                          {pokemon
                            ? formatPokemonName(pokemon.name)
                            : room.pokemonName || `#${roomPokemonId}`}
                        </p>
                        <p className="mt-1 text-sm text-emerald-700">
                          Final bid: {room.currentBid}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-emerald-700">
                      Pokemon Unsold
                    </p>
                  )}
                  {finalizeError && (
                    <p className="mt-3 text-sm text-red-600">{finalizeError}</p>
                  )}
                </div>
              )}

              {!userIsAdmin && (
                <button
                  type="button"
                  onClick={placeBid}
                  disabled={
                    isBidding ||
                    !room.auctionStarted ||
                    room.auctionEnded ||
                    isCurrentHighestBidder ||
                    !hasEnoughCredits
                  }
                  className="mt-5 w-full rounded-md bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto"
                >
                  {isBidding ? "Updating..." : `Bid ${nextBidAmount}`}
                </button>
              )}

              {isCurrentHighestBidder && (
                <p className="mt-4 text-sm text-slate-600">
                  Wait for another player to bid
                </p>
              )}
              {currentUserData && !hasEnoughCredits && (
                <p className="mt-4 text-sm text-red-600">
                  Not enough credits to place this bid.
                </p>
              )}
              {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
              {bidError && <p className="mt-4 text-sm text-red-600">{bidError}</p>}
            </div>

            <section className="mt-6 rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Players</h2>

              {joinError && <p className="mt-4 text-sm text-red-600">{joinError}</p>}
              {forfeitMessage && (
                <p className="mt-4 text-sm text-emerald-700">{forfeitMessage}</p>
              )}
              {forfeitError && (
                <p className="mt-4 text-sm text-red-600">{forfeitError}</p>
              )}

              {loadingPlayers && (
                <p className="mt-4 text-sm text-slate-600">Loading players...</p>
              )}

              {!loadingPlayers && players.length === 0 && (
                <p className="mt-4 text-sm text-slate-600">No players yet.</p>
              )}

              {!loadingPlayers && players.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-100">
                  {players.map((player) => (
                    <li
                      key={player.userId}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">
                            {player.username}
                          </p>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              player.forfeited
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {player.forfeited ? "Forfeited" : "Active"}
                          </span>
                        </div>
                      </div>

                      {!userIsAdmin && player.userId === user.uid && (
                        <button
                          type="button"
                          onClick={() => forfeitPlayer(player)}
                          disabled={
                            Boolean(forfeitingPlayerId) ||
                            player.forfeited ||
                            room.auctionEnded ||
                            room.currentBidderId === player.userId
                          }
                          className="w-fit rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                        >
                          {forfeitingPlayerId === player.userId
                            ? "Forfeiting..."
                            : "Forfeit"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

export default AuctionRoom;
