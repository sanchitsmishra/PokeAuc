export async function fetchPokemon(pokemonNameOrId) {
  const searchValue = String(pokemonNameOrId).trim().toLowerCase();
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${searchValue}`);

  if (!response.ok) {
    throw new Error("Could not load Pokemon data.");
  }

  const pokemon = await response.json();

  return {
    id: pokemon.id,
    name: pokemon.name,
    image: pokemon.sprites.front_default,
    types: pokemon.types.map((typeItem) => typeItem.type.name),
    stats: {
      hp: pokemon.stats.find((item) => item.stat.name === "hp")?.base_stat ?? 0,
      attack:
        pokemon.stats.find((item) => item.stat.name === "attack")?.base_stat ?? 0,
      defense:
        pokemon.stats.find((item) => item.stat.name === "defense")?.base_stat ?? 0,
      specialAttack:
        pokemon.stats.find((item) => item.stat.name === "special-attack")?.base_stat ?? 0,
      specialDefense:
        pokemon.stats.find((item) => item.stat.name === "special-defense")?.base_stat ?? 0,
      speed: pokemon.stats.find((item) => item.stat.name === "speed")?.base_stat ?? 0
    }
  };
}

export function formatPokemonName(name) {
  if (!name) {
    return "";
  }

  return name.charAt(0).toUpperCase() + name.slice(1);
}
