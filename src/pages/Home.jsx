import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { seedSampleRooms } from "../firebase/seedRooms";
import { fetchPokemon, formatPokemonName } from "../api/pokemonApi";
import { createAuctionRoom } from "../firebase/roomHelpers";
import { isAdmin } from "../config/admin";

function Home({ user }) {
  const [roomCode, setRoomCode] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomPokemon, setRoomPokemon] = useState({});
  const [users, setUsers] = useState([]);
  const [userInventories, setUserInventories] = useState({});
  const [inventoryPokemon, setInventoryPokemon] = useState({});
  const [unsoldPokemon, setUnsoldPokemon] = useState({});
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPokemon, setLoadingPokemon] = useState(false);
  const [error, setError] = useState("");
  const [pokemonInput, setPokemonInput] = useState("");
  const [baseBidAmount, setBaseBidAmount] = useState("10");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isSeedingRooms, setIsSeedingRooms] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [showUnsoldList, setShowUnsoldList] = useState(false);
  const navigate = useNavigate();
  const userIsAdmin = isAdmin(user);
  const selectedUser = users.find((appUser) => appUser.id === selectedUserId);
  const selectedInventoryItems = selectedUser
    ? userInventories[selectedUser.id] || []
    : [];
  const unsoldPokemonIds = [
    ...new Set(rooms.flatMap((room) => room.unsoldPokemonIds || []))
  ];
  const unsoldPokemonKey = unsoldPokemonIds.join(",");

  useEffect(() => {
    const roomsQuery = query(collection(db, "rooms"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      roomsQuery,
      (snapshot) => {
        const roomList = snapshot.docs.map((roomDoc) => ({
          id: roomDoc.id,
          ...roomDoc.data()
        }));

        setRooms(roomList);
        setLoadingRooms(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoadingRooms(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const userList = snapshot.docs.map((userDoc) => ({
          id: userDoc.id,
          ...userDoc.data()
        }));

        setUsers(userList);
        setLoadingUsers(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoadingUsers(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (users.length === 0) {
      setUserInventories({});
      return;
    }

    const unsubscribes = users.map((appUser) =>
      onSnapshot(
        collection(db, "users", appUser.id, "inventory"),
        (snapshot) => {
          const inventoryItems = snapshot.docs.map((itemDoc) => ({
            id: itemDoc.id,
            ...itemDoc.data()
          }));

          setUserInventories((currentInventories) => ({
            ...currentInventories,
            [appUser.id]: inventoryItems
          }));
        },
        (snapshotError) => setError(snapshotError.message)
      )
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [users]);

  useEffect(() => {
    const loadInventoryPokemon = async () => {
      const inventoryItems = Object.values(userInventories).flat();
      const pokemonIds = [...new Set(inventoryItems.map((item) => item.pokemonId))];
      const unloadedPokemonIds = pokemonIds.filter((pokemonId) => {
        return pokemonId && !inventoryPokemon[pokemonId];
      });

      if (unloadedPokemonIds.length === 0) {
        return;
      }

      try {
        const pokemonList = await Promise.all(
          unloadedPokemonIds.map(async (pokemonId) => {
            const pokemon = await fetchPokemon(pokemonId);
            return [pokemonId, pokemon];
          })
        );

        setInventoryPokemon((currentPokemon) => ({
          ...currentPokemon,
          ...Object.fromEntries(pokemonList)
        }));
      } catch (pokemonError) {
        setError(pokemonError.message);
      }
    };

    loadInventoryPokemon();
  }, [inventoryPokemon, userInventories]);

  useEffect(() => {
    const loadRoomPokemon = async () => {
      const roomsWithPokemon = rooms.filter(
        (room) => room.pokemonId || room.currentPokemonId
      );

      if (roomsWithPokemon.length === 0) {
        setRoomPokemon({});
        return;
      }

      try {
        setLoadingPokemon(true);

        const pokemonList = await Promise.all(
          roomsWithPokemon.map(async (room) => {
            const pokemon = await fetchPokemon(room.pokemonId || room.currentPokemonId);
            return [room.roomId || room.id, pokemon];
          })
        );

        setRoomPokemon(Object.fromEntries(pokemonList));
      } catch (pokemonError) {
        setError(pokemonError.message);
      } finally {
        setLoadingPokemon(false);
      }
    };

    loadRoomPokemon();
  }, [rooms]);

  useEffect(() => {
    const loadUnsoldPokemon = async () => {
      const unloadedPokemonIds = unsoldPokemonIds.filter((pokemonId) => {
        return pokemonId && !unsoldPokemon[pokemonId];
      });

      if (unloadedPokemonIds.length === 0) {
        return;
      }

      try {
        const pokemonList = await Promise.all(
          unloadedPokemonIds.map(async (pokemonId) => {
            const pokemon = await fetchPokemon(pokemonId);
            return [pokemonId, pokemon];
          })
        );

        setUnsoldPokemon((currentPokemon) => ({
          ...currentPokemon,
          ...Object.fromEntries(pokemonList)
        }));
      } catch (pokemonError) {
        setError(pokemonError.message);
      }
    };

    loadUnsoldPokemon();
  }, [unsoldPokemon, unsoldPokemonKey]);

  const createRoom = async () => {
    if (!userIsAdmin) {
      setError("Only admin can create rooms.");
      return;
    }

    try {
      setError("");
      setIsCreatingRoom(true);

      const pokemonSearch = pokemonInput.trim();
      if (!pokemonSearch) {
        setError("Enter a Pokemon name or ID.");
        setIsCreatingRoom(false);
        return;
      }
      const baseBid = Number(baseBidAmount);
      if (!Number.isInteger(baseBid) || baseBid <= 0) {
        setError("Enter a valid base bid amount.");
        setIsCreatingRoom(false);
        return;
      }

      const pokemon = await fetchPokemon(pokemonSearch);
      const roomId = await createAuctionRoom({
        roomName: `${formatPokemonName(pokemon.name)} Auction Room`,
        adminId: user.uid,
        pokemonId: pokemon.id,
        pokemonName: formatPokemonName(pokemon.name),
        unsoldPokemonIds: [],
        bidStep: baseBid
      });

      navigate(`/room/${roomId}`);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const joinRoom = (event) => {
    event.preventDefault();

    const trimmedCode = roomCode.trim().toUpperCase();
    if (trimmedCode) {
      navigate(`/room/${trimmedCode}`);
    }
  };

  const createSampleRooms = async () => {
    if (!userIsAdmin) {
      setError("Only admin can create rooms.");
      return;
    }

    try {
      setError("");
      setIsSeedingRooms(true);
      await seedSampleRooms(user.uid);
    } catch (seedError) {
      setError(seedError.message);
    } finally {
      setIsSeedingRooms(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto w-full max-w-3xl rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Auction Room</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create a new auction room or join an existing one.
        </p>

        {userIsAdmin && (
          <div className="mt-6 rounded-md border border-slate-200 p-4">
            <label
              htmlFor="pokemon-search"
              className="text-sm font-medium text-slate-700"
            >
              Pokemon Name or Pokemon ID
            </label>
            <input
              id="pokemon-search"
              type="text"
              value={pokemonInput}
              onChange={(event) => setPokemonInput(event.target.value)}
              placeholder="Pikachu, Charizard, Bulbasaur..."
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
            <label
              htmlFor="base-bid"
              className="mt-4 block text-sm font-medium text-slate-700"
            >
              Base Bid Amount
            </label>
            <input
              id="base-bid"
              type="number"
              min="1"
              value={baseBidAmount}
              onChange={(event) => setBaseBidAmount(event.target.value)}
              placeholder="10"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
            <button
              type="button"
              onClick={createRoom}
              disabled={isCreatingRoom}
              className="mt-3 w-full rounded-md bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {isCreatingRoom ? "Creating..." : "Create Room"}
            </button>
          </div>
        )}

        <form onSubmit={joinRoom} className="mt-4 flex gap-2">
          <input
            type="text"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value)}
            placeholder="Enter room code"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-3 font-medium text-white transition hover:bg-slate-700"
          >
            Join
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-8 border-t border-slate-100 pt-6">
          <h2 className="text-lg font-semibold text-slate-900">Available Rooms</h2>

          {loadingRooms && <p className="mt-4 text-sm text-slate-600">Loading rooms...</p>}
          {!loadingRooms && loadingPokemon && (
            <p className="mt-4 text-sm text-slate-600">Loading Pokemon...</p>
          )}

          {!loadingRooms && rooms.length === 0 && (
            <div className="mt-4 rounded-md border border-dashed border-slate-300 p-4">
              <p className="text-sm text-slate-600">No rooms available</p>
              {userIsAdmin && (
                <button
                  type="button"
                  onClick={createSampleRooms}
                  disabled={isSeedingRooms}
                  className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSeedingRooms ? "Adding..." : "Add Sample Rooms"}
                </button>
              )}
            </div>
          )}

          {!loadingRooms && rooms.length > 0 && (
            <div className="mt-4 space-y-3">
              {rooms.map((room) => {
                const roomId = room.roomId || room.id;
                const pokemon = roomPokemon[roomId];

                return (
                  <button
                    key={roomId}
                    type="button"
                    onClick={() => navigate(`/room/${roomId}`)}
                    className="flex w-full items-center gap-4 rounded-md border border-slate-200 p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50"
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-md bg-slate-100">
                      {pokemon?.image ? (
                        <img
                          src={pokemon.image}
                          alt={formatPokemonName(pokemon.name)}
                          className="h-14 w-14 object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">Loading</span>
                      )}
                    </div>

                    <div>
                      <p className="font-medium text-slate-900">{room.roomName}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {!room.pokemonId &&
                          !room.currentPokemonId &&
                          "Pokemon ID not set"}
                        {(room.pokemonId || room.currentPokemonId) &&
                          (pokemon
                            ? formatPokemonName(pokemon.name)
                            : room.pokemonName
                              ? room.pokemonName
                            : "Loading Pokemon")}
                        {" - "}Current bid: {room.currentBid}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {room.auctionStarted
                          ? "Auction started"
                          : "Waiting for admin to start auction"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Players</h2>
            <button
              type="button"
              onClick={() => setShowUnsoldList(true)}
              className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Unsold List
            </button>
          </div>

          {loadingUsers && (
            <p className="mt-4 text-sm text-slate-600">Loading users...</p>
          )}

          {!loadingUsers && users.length === 0 && (
            <p className="mt-4 text-sm text-slate-600">No users yet.</p>
          )}

          {!loadingUsers && users.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {users.map((appUser) => (
                <button
                  key={appUser.id}
                  type="button"
                  onClick={() => setSelectedUserId(appUser.id)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-emerald-500 hover:bg-emerald-50"
                >
                  {appUser.username}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedUser && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 px-4">
          <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {selectedUser.username}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserId("")}
                className="rounded-md border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {selectedInventoryItems.length === 0 && (
              <p className="mt-5 text-sm text-slate-600">
                No Pokemon bought yet.
              </p>
            )}

            {selectedInventoryItems.length > 0 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {selectedInventoryItems.map((item) => {
                  const ownedPokemon = inventoryPokemon[item.pokemonId];

                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border border-slate-200 p-3"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-md bg-slate-50">
                        {ownedPokemon?.image ? (
                          <img
                            src={ownedPokemon.image}
                            alt={item.pokemonName}
                            className="h-14 w-14 object-contain"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">Loading</span>
                        )}
                      </div>

                      <div>
                        <p className="font-medium text-slate-900">
                          {item.pokemonName}
                        </p>
                        <p className="text-sm text-slate-600">
                          Price: {item.purchasePrice}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {showUnsoldList && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 px-4">
          <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Unsold Pokemon
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Pokemon that ended without a winning bid.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUnsoldList(false)}
                className="rounded-md border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {unsoldPokemonIds.length === 0 && (
              <p className="mt-5 text-sm text-slate-600">
                No unsold Pokemon yet.
              </p>
            )}

            {unsoldPokemonIds.length > 0 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {unsoldPokemonIds.map((pokemonId) => {
                  const pokemon = unsoldPokemon[pokemonId];

                  return (
                    <div
                      key={pokemonId}
                      className="flex items-center gap-3 rounded-md border border-slate-200 p-3"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-md bg-slate-50">
                        {pokemon?.image ? (
                          <img
                            src={pokemon.image}
                            alt={formatPokemonName(pokemon.name)}
                            className="h-14 w-14 object-contain"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">Loading</span>
                        )}
                      </div>

                      <p className="font-medium text-slate-900">
                        {pokemon ? formatPokemonName(pokemon.name) : `#${pokemonId}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default Home;
