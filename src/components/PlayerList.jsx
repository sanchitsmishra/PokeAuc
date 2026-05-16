function PlayerList({ players }) {
  return (
    <section className="mt-6 rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Players</h2>

      <ul className="mt-4 divide-y divide-slate-100">
        {players.map((player) => (
          <li key={player} className="py-3 text-slate-700">
            {player}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PlayerList;
