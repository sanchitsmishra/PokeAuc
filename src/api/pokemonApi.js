export async function fetchPokemon(pokemonId) {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`);

  if (!response.ok) {
    throw new Error("Could not load Pokemon data.");
  }

  const pokemon = await response.json();

  return {
    id: pokemon.id,
    name: pokemon.name,
    image: pokemon.sprites.front_default,
    types: pokemon.types.map((typeItem) => typeItem.type.name)
  };
}

export function formatPokemonName(name) {
  if (!name) {
    return "";
  }

  return name.charAt(0).toUpperCase() + name.slice(1);
}
