import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, increment, onSnapshot, updateDoc } from "firebase/firestore";
import PlayerList from "../components/PlayerList";
import { db } from "../firebase/firebase";
import { fetchPokemon, formatPokemonName } from "../api/pokemonApi";

const players = ["Aarav", "Maya", "Rohan", "Isha"];

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
    const loadPokemon = async () => {
      if (!room?.pokemonId) {
        setPokemon(null);
        return;
      }

      try {
        setPokemonError("");
        setLoadingPokemon(true);
        const pokemonData = await fetchPokemon(room.pokemonId);
        setPokemon(pokemonData);
      } catch (error) {
        setPokemonError(error.message);
      } finally {
        setLoadingPokemon(false);
      }
    };

    loadPokemon();
  }, [room?.pokemonId]);

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

        if (!room.auctionEnded) {
          try {
            await updateDoc(doc(db, "rooms", roomId), {
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
    if (isBidding || !room || room.auctionEnded) {
      return;
    }

    const endTime = room.auctionEndTime?.toDate().getTime();
    if (endTime && Date.now() >= endTime) {
      setBidError("Auction has ended.");
      return;
    }

    try {
      setBidError("");
      setMessage("");
      setIsBidding(true);

      const roomRef = doc(db, "rooms", roomId);

      await updateDoc(roomRef, {
        currentBid: increment(50),
        highestBidderId: user.uid,
        highestBidderName: userProfile.username
      });

      setMessage("Bid placed successfully.");
    } catch (bidError) {
      setBidError(bidError.message);
    } finally {
      setIsBidding(false);
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
                {!loadingPokemon && !pokemonError && !room.pokemonId && (
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
                  {room.auctionEnded ? "Auction Ended" : timeLeft}
                </p>
              </div>

              <p className="text-sm font-medium text-slate-500">
                Current Highest Bidder
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {room.highestBidderName || "No bids yet"}
              </p>

              {room.auctionEnded && (
                <div className="mt-5 rounded-md border border-emerald-100 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-800">Auction Ended</p>
                  <p className="mt-1 text-sm text-emerald-700">
                    Winner: {room.highestBidderName || "No winner"}
                  </p>
                  <p className="mt-1 text-sm text-emerald-700">
                    Final bid: {room.currentBid}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={placeBid}
                disabled={isBidding || room.auctionEnded}
                className="mt-5 w-full rounded-md bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto"
              >
                {isBidding ? "Updating..." : "Bid +50"}
              </button>

              {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
              {bidError && <p className="mt-4 text-sm text-red-600">{bidError}</p>}
            </div>

            <PlayerList players={players} />
          </>
        )}
      </section>
    </main>
  );
}

export default AuctionRoom;
