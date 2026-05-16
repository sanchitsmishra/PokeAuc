import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp
} from "firebase/firestore";
import { db } from "./firebase";

const sampleRooms = [
  {
    roomName: "Starter Pokemon Auction",
    currentBid: 100
  },
  {
    roomName: "Rare Pokemon Auction",
    currentBid: 500
  },
  {
    roomName: "Water Type Auction",
    currentBid: 150
  }
];

function getRandomPokemonId() {
  return Math.floor(Math.random() * 151) + 1;
}

export async function seedSampleRooms() {
  const roomPromises = sampleRooms.map((room) => {
    const roomRef = doc(collection(db, "rooms"));
    const auctionEndTime = Timestamp.fromDate(new Date(Date.now() + 2 * 60 * 1000));

    return setDoc(roomRef, {
      roomId: roomRef.id,
      roomName: room.roomName,
      currentBid: room.currentBid,
      pokemonId: getRandomPokemonId(),
      auctionEndTime,
      auctionEnded: false,
      createdAt: serverTimestamp()
    });
  });

  await Promise.all(roomPromises);
}
