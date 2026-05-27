import {
  arrayUnion,
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "./firebase";
import { ADMIN_UID } from "../config/admin";

export function createRoomData({
  roomId,
  roomName,
  adminId,
  pokemonId,
  pokemonName,
  unsoldPokemonIds = [],
  bidStep,
  usersRemaining = 0
}) {
  return {
    roomId,
    roomName,
    adminId,
    auctionStarted: false,
    pokemonId,
    pokemonName,
    currentBid: 0,
    currentBidderId: "",
    currentBidderName: "",
    bidStep,
    usersRemaining,
    unsoldPokemonIds,
    auctionEnded: false,
    auctionFinalized: false,
    createdAt: serverTimestamp()
  };
}

export async function createAuctionRoom({
  roomName,
  adminId,
  pokemonId,
  pokemonName,
  unsoldPokemonIds = [],
  bidStep
}) {
  if (adminId !== ADMIN_UID) {
    throw new Error("Only admin can create rooms.");
  }

  const roomRef = doc(collection(db, "rooms"));

  await setDoc(
    roomRef,
    createRoomData({
      roomId: roomRef.id,
      roomName,
      adminId,
      pokemonId,
      pokemonName,
      unsoldPokemonIds,
      bidStep
    })
  );

  return roomRef.id;
}

export async function joinRoom({ roomId, userId, username }) {
  const playerRef = doc(db, "rooms", roomId, "players", userId);
  const playerSnap = await getDoc(playerRef);

  if (playerSnap.exists()) {
    await updateDoc(playerRef, {
      username
    });
    return;
  }

  await setDoc(playerRef, {
    userId,
    username,
    forfeited: false,
    joinedAt: serverTimestamp()
  });

  await updateDoc(doc(db, "rooms", roomId), {
    usersRemaining: increment(1)
  });
}

export async function resetForfeits(roomId) {
  const playersRef = collection(db, "rooms", roomId, "players");
  const playersSnapshot = await getDocs(playersRef);
  const batch = writeBatch(db);

  playersSnapshot.forEach((playerDoc) => {
    batch.update(playerDoc.ref, {
      forfeited: false
    });
  });

  await batch.commit();
}

export async function startAuction({ roomId, adminId }) {
  if (adminId !== ADMIN_UID) {
    throw new Error("Only admin can start auctions.");
  }

  const roomRef = doc(db, "rooms", roomId);

  await resetForfeits(roomId);

  await updateDoc(roomRef, {
    auctionStarted: true,
    auctionEnded: false,
    auctionFinalized: false
  });
}

export async function selectPokemon({ roomId, pokemonId, pokemonName, adminId }) {
  if (adminId !== ADMIN_UID) {
    throw new Error("Only admin can select Pokemon.");
  }

  const roomRef = doc(db, "rooms", roomId);

  await updateDoc(roomRef, {
    pokemonId,
    pokemonName,
    currentBid: 0,
    currentBidderId: "",
    currentBidderName: "",
    unsoldPokemonIds: arrayRemove(pokemonId),
    auctionEnded: false,
    auctionFinalized: false
  });
}

export async function finalizeAuction({ roomId, pokemon }) {
  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);

    if (!roomSnap.exists()) {
      throw new Error("Room not found.");
    }

    const room = roomSnap.data();

    const pokemonId = room.pokemonId || room.currentPokemonId;

    if (room.auctionFinalized || !pokemonId) {
      return;
    }

    if (!room.currentBidderId || (room.currentBid || 0) === 0) {
      transaction.update(roomRef, {
        auctionStarted: false,
        auctionEnded: true,
        auctionFinalized: true,
        currentBidderId: "",
        currentBidderName: "",
        unsoldPokemonIds: arrayUnion(pokemonId)
      });
      return;
    }

    const winnerRef = doc(db, "users", room.currentBidderId);
    const inventoryRef = doc(
      db,
      "users",
      room.currentBidderId,
      "inventory",
      String(pokemonId)
    );
    const winnerSnap = await transaction.get(winnerRef);

    if (!winnerSnap.exists()) {
      throw new Error("Winner player document not found.");
    }

    const winner = winnerSnap.data();
    const finalBid = room.currentBid || 0;
    const currentCredits = winner.credits ?? 360;

    transaction.update(winnerRef, {
      credits: currentCredits - finalBid
    });

    transaction.set(inventoryRef, {
      pokemonId,
      pokemonName: pokemon.name,
      purchasePrice: finalBid,
      types: pokemon.types,
      wonAt: serverTimestamp(),
      roomId
    });

    transaction.update(roomRef, {
      auctionStarted: false,
      auctionEnded: true,
      auctionFinalized: true
    });
  });
}

export async function addPokemonToInventory({
  userId,
  pokemonId,
  pokemonName,
  purchasePrice,
  types,
  roomId
}) {
  const inventoryRef = doc(
    db,
    "users",
    userId,
    "inventory",
    String(pokemonId)
  );

  await setDoc(inventoryRef, {
    pokemonId,
    pokemonName,
    purchasePrice,
    types,
    wonAt: serverTimestamp(),
    roomId
  });
}

export async function addBidHistory({ roomId, bidderId, bidderName, amount }) {
  const bidRef = doc(collection(db, "rooms", roomId, "bids"));

  await setDoc(bidRef, {
    bidderId,
    bidderName,
    amount,
    createdAt: serverTimestamp()
  });
}
