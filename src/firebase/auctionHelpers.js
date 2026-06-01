import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "./firebase";
import { ADMIN_UID } from "../config/admin";

const LIVE_AUCTION_PATH = ["currentAuction", "live"];

function getLiveAuctionRef() {
  return doc(db, ...LIVE_AUCTION_PATH);
}

export async function ensurePlayerInLiveAuction({ userId, username }) {
  const playerRef = doc(db, ...LIVE_AUCTION_PATH, "players", userId);
  const playerSnap = await getDoc(playerRef);

  if (playerSnap.exists()) {
    await updateDoc(playerRef, { username });
    return;
  }

  await setDoc(playerRef, {
    userId,
    username,
    forfeited: false,
    joinedAt: serverTimestamp()
  });
}

async function resetForfeits() {
  const playersRef = collection(db, ...LIVE_AUCTION_PATH, "players");
  const playersSnapshot = await getDocs(playersRef);
  const batch = writeBatch(db);

  playersSnapshot.forEach((playerDoc) => {
    batch.update(playerDoc.ref, { forfeited: false });
  });

  await batch.commit();
}

export async function startLiveAuction({
  adminId,
  pokemonId,
  pokemonName,
  bidStep
}) {
  if (adminId !== ADMIN_UID) {
    throw new Error("Only admin can start auctions.");
  }

  const auctionRef = getLiveAuctionRef();
  const auctionSnap = await getDoc(auctionRef);
  const currentUnsoldIds = auctionSnap.exists() ? auctionSnap.data().unsoldPokemonIds || [] : [];

  await resetForfeits();

  await setDoc(
    auctionRef,
    {
      pokemonId,
      pokemonName,
      auctionStarted: true,
      auctionEnded: false,
      auctionFinalized: false,
      auctionEndedAt: null,
      currentBid: 0,
      currentBidderId: "",
      currentBidderName: "",
      bidStep,
      unsoldPokemonIds: currentUnsoldIds,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function addBidHistory({ bidderId, bidderName, amount }) {
  const bidRef = doc(collection(db, ...LIVE_AUCTION_PATH, "bids"));
  await setDoc(bidRef, {
    bidderId,
    bidderName,
    amount,
    createdAt: serverTimestamp()
  });
}

export async function finalizeLiveAuction({ pokemon }) {
  const auctionRef = getLiveAuctionRef();

  await runTransaction(db, async (transaction) => {
    const auctionSnap = await transaction.get(auctionRef);

    if (!auctionSnap.exists()) {
      throw new Error("Live auction not found.");
    }

    const auction = auctionSnap.data();
    const pokemonId = auction.pokemonId;

    if (!pokemonId || auction.auctionFinalized) {
      return;
    }

    if (!auction.currentBidderId || (auction.currentBid || 0) === 0) {
      transaction.update(auctionRef, {
        auctionStarted: false,
        auctionEnded: true,
        auctionFinalized: true,
        auctionEndedAt: serverTimestamp(),
        currentBidderId: "",
        currentBidderName: "",
        unsoldPokemonIds: arrayUnion(pokemonId),
        updatedAt: serverTimestamp()
      });
      return;
    }

    const winnerRef = doc(db, "users", auction.currentBidderId);
    const inventoryRef = doc(
      db,
      "users",
      auction.currentBidderId,
      "inventory",
      String(pokemonId)
    );

    const winnerSnap = await transaction.get(winnerRef);
    if (!winnerSnap.exists()) {
      throw new Error("Winner user document not found.");
    }

    const winner = winnerSnap.data();
    const finalBid = auction.currentBid || 0;
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
      source: "live-auction"
    });

    transaction.update(auctionRef, {
      auctionStarted: false,
      auctionEnded: true,
      auctionFinalized: true,
      auctionEndedAt: serverTimestamp(),
      unsoldPokemonIds: arrayRemove(pokemonId),
      updatedAt: serverTimestamp()
    });
  });
}

export async function givePokemonToUser({ adminId, userId, pokemon, purchasePrice }) {
  if (adminId !== ADMIN_UID) {
    throw new Error("Only admin can give Pokemon.");
  }

  if (!userId) {
    throw new Error("Select a player first.");
  }

  const pokemonId = pokemon.pokemonId;
  const inventoryRef = doc(db, "users", userId, "inventory", String(pokemonId));

  await setDoc(inventoryRef, {
    pokemonId,
    pokemonName: pokemon.name,
    purchasePrice,
    types: pokemon.types,
    wonAt: serverTimestamp(),
    source: "live-auction"
  });

  const auctionRef = getLiveAuctionRef();
  const auctionSnap = await getDoc(auctionRef);

  if (auctionSnap.exists()) {
    const unsoldIds = auctionSnap.data().unsoldPokemonIds || [];
    if (unsoldIds.includes(pokemonId)) {
      await updateDoc(auctionRef, {
        unsoldPokemonIds: arrayRemove(pokemonId),
        updatedAt: serverTimestamp()
      });
    }
  }
}
