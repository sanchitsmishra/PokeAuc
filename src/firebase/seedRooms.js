import { createAuctionRoom } from "./roomHelpers";
import { ADMIN_UID } from "../config/admin";
import { fetchPokemon, formatPokemonName } from "../api/pokemonApi";

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

function getRandomPokemonIds(count) {
  const pokemonIds = new Set();

  while (pokemonIds.size < count) {
    pokemonIds.add(getRandomPokemonId());
  }

  return Array.from(pokemonIds);
}

export async function seedSampleRooms(adminId = "sample-admin") {
  if (adminId !== ADMIN_UID) {
    throw new Error("Only admin can create rooms.");
  }

  const roomPromises = sampleRooms.map((room) => {
    const pokemonIds = getRandomPokemonIds(6);
    const selectedPokemonId = pokemonIds[0];

    return fetchPokemon(selectedPokemonId).then((pokemon) => createAuctionRoom({
      roomName: room.roomName,
      adminId,
      pokemonId: pokemon.id,
      pokemonName: formatPokemonName(pokemon.name),
      unsoldPokemonIds: pokemonIds.slice(1),
      bidStep: 10
    }));
  });

  await Promise.all(roomPromises);
}
