import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { seedSampleRooms } from "../firebase/seedRooms";
import { fetchPokemon, formatPokemonName } from "../api/pokemonApi";

function Home() {
  const [roomCode, setRoomCode] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomPokemon, setRoomPokemon] = useState({});
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingPokemon, setLoadingPokemon] = useState(false);
  const [error, setError] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isSeedingRooms, setIsSeedingRooms] = useState(false);
  const navigate = useNavigate();

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
    const loadRoomPokemon = async () => {
      const roomsWithPokemon = rooms.filter((room) => room.pokemonId);

      if (roomsWithPokemon.length === 0) {
        setRoomPokemon({});
        return;
      }

      try {
        setLoadingPokemon(true);

        const pokemonList = await Promise.all(
          roomsWithPokemon.map(async (room) => {
            const pokemon = await fetchPokemon(room.pokemonId);
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

  const createRoom = async () => {
    try {
      setError("");
      setIsCreatingRoom(true);

      const roomRef = doc(collection(db, "rooms"));
      const auctionEndTime = Timestamp.fromDate(new Date(Date.now() + 2 * 60 * 1000));
      const roomData = {
        roomId: roomRef.id,
        roomName: "Pokemon Auction Room",
        currentBid: 0,
        pokemonId: Math.floor(Math.random() * 151) + 1,
        auctionEndTime,
        auctionEnded: false,
        createdAt: serverTimestamp()
      };

      await setDoc(roomRef, roomData);
      navigate(`/room/${roomRef.id}`);
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
    try {
      setError("");
      setIsSeedingRooms(true);
      await seedSampleRooms();
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

        <button
          type="button"
          onClick={createRoom}
          disabled={isCreatingRoom}
          className="mt-6 w-full rounded-md bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {isCreatingRoom ? "Creating..." : "Create Room"}
        </button>

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
              <button
                type="button"
                onClick={createSampleRooms}
                disabled={isSeedingRooms}
                className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSeedingRooms ? "Adding..." : "Add Sample Rooms"}
              </button>
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
                        {!room.pokemonId && "Pokemon ID not set"}
                        {room.pokemonId &&
                          (pokemon
                            ? formatPokemonName(pokemon.name)
                            : "Loading Pokemon")}
                        {" - "}Current bid: {room.currentBid}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {room.auctionEnded ? "Auction ended" : "Auction running"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default Home;
