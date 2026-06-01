import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  limit
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import { fetchPokemon, formatPokemonName } from "../api/pokemonApi";
import * as XLSX from "xlsx";
import {
  addBidHistory,
  ensurePlayerInLiveAuction,
  finalizeLiveAuction,
  givePokemonToUser,
  startLiveAuction
} from "../firebase/auctionHelpers";
import { ADMIN_UID, isAdmin } from "../config/admin";

const CHAT_MESSAGE_TTL_MS = 20 * 1000;
const CHAT_CLEANUP_INTERVAL_MS = 5000;

function getBidIncrement(currentBid) {
  if (currentBid < 40) return 1;
  if (currentBid < 70) return 2;
  if (currentBid < 100) return 3;
  return 4;
}

function Home({ user, userProfile }) {
  const [auction, setAuction] = useState(null);
  const [players, setPlayers] = useState([]);
  const [users, setUsers] = useState([]);
  const [userInventories, setUserInventories] = useState({});
  const [inventoryPokemon, setInventoryPokemon] = useState({});
  const [unsoldPokemon, setUnsoldPokemon] = useState({});
  const [pokemon, setPokemon] = useState(null);
  const [loadingAuction, setLoadingAuction] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [pokemonInput, setPokemonInput] = useState("");
  const [baseBidAmount, setBaseBidAmount] = useState("10");
  const [isStartingAuction, setIsStartingAuction] = useState(false);
  const [isBidding, setIsBidding] = useState(false);
  const [forfeitingPlayerId, setForfeitingPlayerId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [showUnsoldList, setShowUnsoldList] = useState(false);
  const [joinedPlayerKey, setJoinedPlayerKey] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [givePokemonUserId, setGivePokemonUserId] = useState("");
  const [givePokemonSearch, setGivePokemonSearch] = useState("");
  const [givePokemonPrice, setGivePokemonPrice] = useState("");
  const [isGivingPokemon, setIsGivingPokemon] = useState(false);
  const chatScrollRef = useRef(null);
  const userIsAdmin = isAdmin(user);

  const playersForAdminTools = users.filter(
    (appUser) => appUser.id !== ADMIN_UID && appUser.username
  );

  const selectedUser = users.find((appUser) => appUser.id === selectedUserId);
  const selectedInventoryItems = selectedUser
    ? userInventories[selectedUser.id] || []
    : [];

  const userCreditsById = useMemo(
    () =>
      Object.fromEntries(users.map((appUser) => [appUser.id, appUser.credits ?? 0])),
    [users]
  );

  const currentUserData = user ? users.find((appUser) => appUser.id === user.uid) : null;
  const currentPlayer = players.find((player) => player.userId === user?.uid);
  const activePlayers = players.filter((player) => !player.forfeited);
  const onlyActivePlayerId = activePlayers[0]?.userId || "";
  const isCurrentHighestBidder = auction?.currentBidderId === user?.uid;
  const nextBidAmount = auction
    ? !auction.currentBid || auction.currentBid === 0
      ? auction.bidStep || 10
      : auction.currentBid + getBidIncrement(auction.currentBid)
    : 0;
  const hasEnoughCredits = currentUserData ? currentUserData.credits >= nextBidAmount : false;
  const activePlayerNames = players.filter((player) => !player.forfeited).map((player) => player.username);
  const forfeitedPlayerNames = players.filter((player) => player.forfeited).map((player) => player.username);
  const auctionIsLive = Boolean(auction?.auctionStarted && !auction?.auctionEnded);
  const auctionIsEnded = Boolean(auction?.auctionEnded);

  const soldPokemonIds = new Set(
    Object.values(userInventories)
      .flat()
      .map((item) => item.pokemonId)
      .filter(Boolean)
  );
  const unsoldPokemonIds = auction?.unsoldPokemonIds || [];
  const activeUnsoldPokemonIds = unsoldPokemonIds.filter(
    (pokemonId) => !soldPokemonIds.has(pokemonId)
  );
  const pokemonStats = pokemon?.stats || null;
  const pokemonBst = pokemonStats
    ? pokemonStats.hp +
      pokemonStats.attack +
      pokemonStats.defense +
      pokemonStats.specialAttack +
      pokemonStats.specialDefense +
      pokemonStats.speed
    : 0;

  const cleanupOldChatMessages = async () => {
    const cutoffTimestamp = Timestamp.fromDate(
      new Date(Date.now() - CHAT_MESSAGE_TTL_MS)
    );
    let hasMoreOldMessages = true;

    while (hasMoreOldMessages) {
      const oldMessagesQuery = query(
        collection(db, "auctionChat", "global", "messages"),
        where("createdAt", "<", cutoffTimestamp),
        limit(50)
      );
      const oldMessagesSnapshot = await getDocs(oldMessagesQuery);

      if (oldMessagesSnapshot.empty) {
        hasMoreOldMessages = false;
        break;
      }

      await Promise.all(
        oldMessagesSnapshot.docs.map((messageDoc) => deleteDoc(messageDoc.ref))
      );

      hasMoreOldMessages = oldMessagesSnapshot.size === 50;
    }
  };

  useEffect(() => {
    const auctionRef = doc(db, "currentAuction", "live");
    const unsubscribe = onSnapshot(
      auctionRef,
      (auctionDoc) => {
        setAuction(auctionDoc.exists() ? auctionDoc.data() : null);
        setLoadingAuction(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoadingAuction(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const chatQuery = query(
      collection(db, "auctionChat", "global", "messages"),
      orderBy("createdAt", "asc"),
      limit(60)
    );

    const unsubscribe = onSnapshot(
      chatQuery,
      (snapshot) => {
        const messages = snapshot.docs.map((chatDoc) => ({
          id: chatDoc.id,
          ...chatDoc.data()
        }));
        setChatMessages(messages);
      },
      (snapshotError) => {
        setError(snapshotError.message);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    const runCleanup = async () => {
      try {
        await cleanupOldChatMessages();
      } catch (cleanupError) {
        setError(cleanupError.message);
      }
    };

    runCleanup();
    const intervalId = setInterval(runCleanup, CHAT_CLEANUP_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isChatOpen]);

  useEffect(() => {
    if (!chatScrollRef.current) {
      return;
    }
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    const playersQuery = query(
      collection(db, "currentAuction", "live", "players"),
      orderBy("joinedAt", "asc")
    );

    const unsubscribe = onSnapshot(
      playersQuery,
      (snapshot) => {
        const playerList = snapshot.docs.map((playerDoc) => ({
          id: playerDoc.id,
          ...playerDoc.data()
        }));
        setPlayers(playerList);
        setLoadingPlayers(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoadingPlayers(false);
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
    if (!user || !userProfile?.username || userIsAdmin) {
      return;
    }

    const playerKey = `${user.uid}-${userProfile.username}`;
    if (joinedPlayerKey === playerKey) {
      return;
    }

    const joinPlayer = async () => {
      try {
        await ensurePlayerInLiveAuction({
          userId: user.uid,
          username: userProfile.username
        });
        setJoinedPlayerKey(playerKey);
      } catch (joinError) {
        setError(joinError.message);
      }
    };

    joinPlayer();
  }, [joinedPlayerKey, user, userIsAdmin, userProfile]);

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
      const unloadedIds = pokemonIds.filter((pokemonId) => pokemonId && !inventoryPokemon[pokemonId]);

      if (unloadedIds.length === 0) {
        return;
      }

      try {
        const pokemonList = await Promise.all(
          unloadedIds.map(async (pokemonId) => {
            const pokemonData = await fetchPokemon(pokemonId);
            return [pokemonId, pokemonData];
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
    const loadCurrentPokemon = async () => {
      if (!auction?.pokemonId) {
        setPokemon(null);
        return;
      }

      try {
        const pokemonData = await fetchPokemon(auction.pokemonId);
        setPokemon(pokemonData);
      } catch (pokemonError) {
        setError(pokemonError.message);
      }
    };

    loadCurrentPokemon();
  }, [auction?.pokemonId]);

  useEffect(() => {
    const loadUnsoldPokemon = async () => {
      const unloadedIds = activeUnsoldPokemonIds.filter(
        (pokemonId) => pokemonId && !unsoldPokemon[pokemonId]
      );
      if (unloadedIds.length === 0) {
        return;
      }

      try {
        const pokemonList = await Promise.all(
          unloadedIds.map(async (pokemonId) => {
            const pokemonData = await fetchPokemon(pokemonId);
            return [pokemonId, pokemonData];
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
  }, [activeUnsoldPokemonIds, unsoldPokemon]);

  useEffect(() => {
    const endAuctionAfterForfeits = async () => {
      if (!auction?.auctionStarted || loadingPlayers || players.length === 0) {
        return;
      }

      const hasBid = (auction.currentBid || 0) > 0;
      const everyoneForfeitedBeforeBid = !hasBid && activePlayers.length === 0;
      const highestBidderIsOnlyActivePlayer =
        hasBid &&
        players.length >= 2 &&
        activePlayers.length === 1 &&
        onlyActivePlayerId === auction.currentBidderId;

      if (!everyoneForfeitedBeforeBid && !highestBidderIsOnlyActivePlayer) {
        return;
      }

      try {
        await updateDoc(doc(db, "currentAuction", "live"), {
          auctionStarted: false,
          auctionEnded: true,
          auctionEndedAt: serverTimestamp()
        });
      } catch (auctionError) {
        setError(auctionError.message);
      }
    };

    endAuctionAfterForfeits();
  }, [activePlayers.length, auction, loadingPlayers, onlyActivePlayerId, players.length]);

  useEffect(() => {
    const finishAuction = async () => {
      if (!auction?.auctionEnded || auction.auctionFinalized) {
        return;
      }

      if (auction.currentBidderId && !pokemon) {
        return;
      }

      try {
        await finalizeLiveAuction({
          pokemon: pokemon
            ? {
                name: formatPokemonName(pokemon.name),
                types: pokemon.types.map((type) => formatPokemonName(type))
              }
            : null
        });
      } catch (finalizeError) {
        setError(finalizeError.message);
      }
    };

    finishAuction();
  }, [auction, pokemon]);

  const handleStartAuction = async () => {
    if (!userIsAdmin) {
      return;
    }

    try {
      setError("");
      setMessage("");
      setIsStartingAuction(true);

      const pokemonSearch = pokemonInput.trim();
      if (!pokemonSearch) {
        throw new Error("Enter a Pokemon name or ID.");
      }

      const baseBid = Number(baseBidAmount);
      if (!Number.isInteger(baseBid) || baseBid <= 0) {
        throw new Error("Enter a valid base bid amount.");
      }

      const selectedPokemon = await fetchPokemon(pokemonSearch);
      await startLiveAuction({
        adminId: user.uid,
        pokemonId: selectedPokemon.id,
        pokemonName: formatPokemonName(selectedPokemon.name),
        bidStep: baseBid
      });
      setMessage("Live auction started.");
    } catch (startError) {
      setError(startError.message);
    } finally {
      setIsStartingAuction(false);
    }
  };

  const placeBid = async () => {
    if (userIsAdmin || !auction || isBidding) {
      return;
    }
    if (!auction.auctionStarted || auction.auctionEnded) {
      setError("Auction is not active.");
      return;
    }
    if (currentPlayer?.forfeited) {
      setError("You forfeited and cannot bid.");
      return;
    }
    if (isCurrentHighestBidder) {
      setError("Wait for another player to bid.");
      return;
    }
    if (!hasEnoughCredits) {
      setError("Not enough credits to place this bid.");
      return;
    }

    try {
      setError("");
      setMessage("");
      setIsBidding(true);

      await updateDoc(doc(db, "currentAuction", "live"), {
        currentBid: nextBidAmount,
        currentBidderId: user.uid,
        currentBidderName: userProfile.username
      });

      await addBidHistory({
        bidderId: user.uid,
        bidderName: userProfile.username,
        amount: nextBidAmount
      });

      setMessage("Bid placed successfully.");
    } catch (bidError) {
      setError(bidError.message);
    } finally {
      setIsBidding(false);
    }
  };

  const forfeitPlayer = async () => {
    if (userIsAdmin || !currentPlayer || forfeitingPlayerId) {
      return;
    }
    if (auction?.currentBidderId === user?.uid) {
      setError("Highest bidder cannot forfeit.");
      return;
    }

    try {
      setError("");
      setForfeitingPlayerId(user.uid);
      await updateDoc(doc(db, "currentAuction", "live", "players", user.uid), {
        forfeited: true
      });
      setMessage("You forfeited this auction.");
    } catch (forfeitError) {
      setError(forfeitError.message);
    } finally {
      setForfeitingPlayerId("");
    }
  };

  const sendChatMessage = async () => {
    const cleanMessage = chatInput.trim();
    if (!cleanMessage) {
      return;
    }
    if (!user || !userProfile?.username) {
      return;
    }

    try {
      setSendingChat(true);
      await cleanupOldChatMessages();
      await addDoc(collection(db, "auctionChat", "global", "messages"), {
        username: userProfile.username,
        userId: user.uid,
        message: cleanMessage,
        createdAt: serverTimestamp()
      });
      setChatInput("");
    } catch (chatError) {
      setError(chatError.message);
    } finally {
      setSendingChat(false);
    }
  };

  const handleGivePokemon = async () => {
    if (!userIsAdmin || isGivingPokemon) {
      return;
    }

    try {
      setError("");
      setMessage("");
      setIsGivingPokemon(true);

      if (!givePokemonUserId) {
        throw new Error("Select a player first.");
      }

      const pokemonSearch = givePokemonSearch.trim();
      if (!pokemonSearch) {
        throw new Error("Enter a Pokemon name or ID.");
      }

      const purchasePrice = Number(givePokemonPrice);
      if (!Number.isInteger(purchasePrice) || purchasePrice < 0) {
        throw new Error("Enter a valid purchase price.");
      }

      const selectedPokemon = await fetchPokemon(pokemonSearch);
      await givePokemonToUser({
        adminId: user.uid,
        userId: givePokemonUserId,
        pokemon: {
          pokemonId: selectedPokemon.id,
          name: formatPokemonName(selectedPokemon.name),
          types: selectedPokemon.types.map((type) => formatPokemonName(type))
        },
        purchasePrice
      });

      setGivePokemonSearch("");
      setGivePokemonPrice("");
      setMessage("Pokemon added to player inventory.");
    } catch (giveError) {
      setError(giveError.message);
    } finally {
      setIsGivingPokemon(false);
    }
  };

  const exportAuctionResultsToExcel = async () => {
    if (!userIsAdmin || isExportingExcel) {
      return;
    }

    try {
      setIsExportingExcel(true);
      setError("");

      const exportUsers = users
        .filter((appUser) => appUser.id !== ADMIN_UID && appUser.username)
        .sort((a, b) => a.username.localeCompare(b.username));

      if (exportUsers.length === 0) {
        throw new Error("No player data found to export.");
      }

      const maxInventoryLength = Math.max(
        0,
        ...exportUsers.map((appUser) => (userInventories[appUser.id] || []).length)
      );

      const sheetData = Array.from({ length: maxInventoryLength + 1 }, () => []);

      exportUsers.forEach((appUser, playerIndex) => {
        const startColumnIndex = playerIndex * 2;
        const playerInventory = userInventories[appUser.id] || [];

        sheetData[0][startColumnIndex] = appUser.username;
        sheetData[0][startColumnIndex + 1] = "";

        playerInventory.forEach((item, itemIndex) => {
          const rowIndex = itemIndex + 1;
          sheetData[rowIndex][startColumnIndex] = item.pokemonName || "";
          sheetData[rowIndex][startColumnIndex + 1] = item.purchasePrice ?? "";
        });
      });

      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Auction Results");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `PokeAuc_Results_${timestamp}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black px-4 py-8 text-slate-100">
      <section className="mx-auto w-full max-w-6xl">
        <header className="mb-8 rounded-2xl border border-[#2A75BB]/55 bg-neutral-950/95 p-5 shadow-lg shadow-[#2A75BB]/20">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <h1 className="text-5xl font-black uppercase tracking-[0.2em] text-[#FFCB05] [text-shadow:0_0_8px_rgba(255,203,5,0.65),2px_2px_0_rgba(42,117,187,0.9)] sm:text-6xl">
              PokeAuc
            </h1>
            <p className="text-xs uppercase tracking-[0.28em] text-[#7fc2ff] sm:text-sm">
              Live Pokemon Auction Arena
            </p>
          </div>
        </header>

        {!isChatOpen && (
          <section className="rounded-2xl border border-[#2A75BB]/35 bg-neutral-900/85 p-6 shadow-xl shadow-[#2A75BB]/10">
          {userIsAdmin && (
            <div className="rounded-xl border border-[#2A75BB]/45 bg-black/70 p-4">
              <h2 className="text-lg font-semibold text-[#FFCB05]">Start New Auction</h2>
              <label htmlFor="pokemon-search" className="mt-4 block text-sm text-[#7fc2ff]">
                Pokemon Name or ID
              </label>
              <input
                id="pokemon-search"
                type="text"
                value={pokemonInput}
                onChange={(event) => setPokemonInput(event.target.value)}
                placeholder="Pikachu or 25"
                className="mt-2 w-full rounded-md border border-[#2A75BB]/40 bg-neutral-950 px-3 py-3 text-slate-100 outline-none transition focus:border-[#2A75BB] focus:ring-2 focus:ring-[#2A75BB]/40"
              />
              <label htmlFor="base-bid" className="mt-4 block text-sm text-[#7fc2ff]">
                Base Bid
              </label>
              <input
                id="base-bid"
                type="number"
                min="1"
                value={baseBidAmount}
                onChange={(event) => setBaseBidAmount(event.target.value)}
                className="mt-2 w-full rounded-md border border-[#2A75BB]/40 bg-neutral-950 px-3 py-3 text-slate-100 outline-none transition focus:border-[#2A75BB] focus:ring-2 focus:ring-[#2A75BB]/40"
              />
              <button
                type="button"
                onClick={handleStartAuction}
                disabled={isStartingAuction}
                className="mt-4 w-full rounded-md bg-[#FFCB05] px-4 py-3 font-semibold text-black shadow-md shadow-[#FFCB05]/25 transition duration-200 hover:bg-yellow-300 hover:shadow-[#FFCB05]/40 disabled:cursor-not-allowed disabled:bg-yellow-200"
              >
                {isStartingAuction ? "Starting..." : "Start Auction"}
              </button>
            </div>
          )}

          {userIsAdmin && (
            <div className="mt-4 rounded-xl border border-[#2A75BB]/45 bg-black/70 p-4">
              <h2 className="text-lg font-semibold text-[#FFCB05]">Give Pokemon</h2>
              <p className="mt-1 text-sm text-slate-300">
                Add a Pokemon directly to a player inventory.
              </p>

              <label htmlFor="give-user" className="mt-4 block text-sm text-[#7fc2ff]">
                Select Player
              </label>
              <select
                id="give-user"
                value={givePokemonUserId}
                onChange={(event) => setGivePokemonUserId(event.target.value)}
                className="mt-2 w-full rounded-md border border-[#2A75BB]/40 bg-neutral-950 px-3 py-3 text-slate-100 outline-none transition focus:border-[#2A75BB] focus:ring-2 focus:ring-[#2A75BB]/40"
              >
                <option value="">Choose a player</option>
                {playersForAdminTools.map((appUser) => (
                  <option key={appUser.id} value={appUser.id}>
                    {appUser.username}
                  </option>
                ))}
              </select>

              <label htmlFor="give-pokemon-search" className="mt-4 block text-sm text-[#7fc2ff]">
                Pokemon Name or ID
              </label>
              <input
                id="give-pokemon-search"
                type="text"
                value={givePokemonSearch}
                onChange={(event) => setGivePokemonSearch(event.target.value)}
                placeholder="Pikachu or 25"
                className="mt-2 w-full rounded-md border border-[#2A75BB]/40 bg-neutral-950 px-3 py-3 text-slate-100 outline-none transition focus:border-[#2A75BB] focus:ring-2 focus:ring-[#2A75BB]/40"
              />

              <label htmlFor="give-pokemon-price" className="mt-4 block text-sm text-[#7fc2ff]">
                Purchase Price
              </label>
              <input
                id="give-pokemon-price"
                type="number"
                min="0"
                value={givePokemonPrice}
                onChange={(event) => setGivePokemonPrice(event.target.value)}
                placeholder="0"
                className="mt-2 w-full rounded-md border border-[#2A75BB]/40 bg-neutral-950 px-3 py-3 text-slate-100 outline-none transition focus:border-[#2A75BB] focus:ring-2 focus:ring-[#2A75BB]/40"
              />

              <button
                type="button"
                onClick={handleGivePokemon}
                disabled={isGivingPokemon || !givePokemonUserId}
                className="mt-4 w-full rounded-md bg-[#2A75BB] px-4 py-3 font-semibold text-white shadow-md shadow-[#2A75BB]/25 transition duration-200 hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isGivingPokemon ? "Adding..." : "Add Pokemon"}
              </button>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-[#2A75BB]/40 bg-black/70 p-5 shadow-lg shadow-[#2A75BB]/10">
            {loadingAuction && (
              <p className="text-sm text-slate-300">Loading auction...</p>
            )}

            {!loadingAuction && !auction?.pokemonId && (
              <p className="text-sm text-slate-300">No active Pokemon yet.</p>
            )}

            {!loadingAuction && auction?.pokemonId && (
              <>
                <div className="flex flex-col items-center gap-4 border-b border-[#2A75BB]/25 pb-6 text-center sm:flex-row sm:text-left">
                  {pokemon?.image && (
                    <img
                      src={pokemon.image}
                      alt={formatPokemonName(pokemon.name)}
                      className="h-28 w-28 object-contain sm:h-32 sm:w-32"
                    />
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7fc2ff]">
                      Live Pokemon
                    </p>
                    <p className="mt-1 text-3xl font-black text-[#FFCB05] sm:text-4xl">
                      {pokemon ? formatPokemonName(pokemon.name) : auction.pokemonName}
                    </p>
                    {pokemon?.types?.length > 0 && (
                      <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                        {pokemon.types.map((type) => (
                          <span
                            key={type}
                            className="rounded-full bg-[#2A75BB]/20 px-3 py-1 text-xs font-medium text-[#7fc2ff]"
                          >
                            {formatPokemonName(type)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                  <div className="space-y-5 lg:col-span-2">
                    <div className="flex flex-wrap items-center gap-3">
                      {auctionIsLive && (
                        <span className="rounded-full border border-green-400/60 bg-green-500/20 px-5 py-2 text-lg font-bold uppercase tracking-wide text-green-300 shadow-md shadow-green-500/20">
                          Live
                        </span>
                      )}
                      {auctionIsEnded && (
                        <span className="rounded-full border border-red-400/60 bg-red-500/20 px-5 py-2 text-lg font-bold uppercase tracking-wide text-red-300 shadow-md shadow-red-500/20">
                          Ended
                        </span>
                      )}
                      {!auctionIsLive && !auctionIsEnded && (
                        <span className="rounded-full border border-[#2A75BB]/60 bg-[#2A75BB]/20 px-5 py-2 text-lg font-bold uppercase tracking-wide text-[#7fc2ff]">
                          Waiting
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-[#7fc2ff]">
                        Current Bid
                      </p>
                      <p className="mt-1 text-6xl font-black leading-none text-[#FFCB05] drop-shadow-[0_0_12px_rgba(255,203,5,0.45)] sm:text-7xl">
                        {auction.currentBid || 0}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-[#7fc2ff]">
                        Highest Bidder
                      </p>
                      <p className="mt-1 text-2xl font-bold text-slate-100 sm:text-3xl">
                        {auction.currentBidderName || "No bids yet"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-[#7fc2ff]">
                        Base Price
                      </p>
                      <p className="mt-1 text-3xl font-bold text-[#FFCB05]">
                        {auction.bidStep || 0}
                      </p>
                    </div>

                    {!userIsAdmin && (
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={placeBid}
                          disabled={
                            isBidding ||
                            !auction?.auctionStarted ||
                            auction?.auctionEnded ||
                            isCurrentHighestBidder ||
                            !hasEnoughCredits ||
                            currentPlayer?.forfeited
                          }
                          className="flex-1 rounded-md bg-[#FFCB05] px-4 py-3 text-lg font-semibold text-black shadow-md shadow-[#FFCB05]/25 transition duration-200 hover:bg-yellow-300 hover:shadow-[#FFCB05]/35 disabled:cursor-not-allowed disabled:bg-yellow-200"
                        >
                          {isBidding ? "Bidding..." : `Bid ${nextBidAmount || 0}`}
                        </button>
                        <button
                          type="button"
                          onClick={forfeitPlayer}
                          disabled={
                            !currentPlayer ||
                            currentPlayer.forfeited ||
                            forfeitingPlayerId === user?.uid ||
                            auction?.auctionEnded ||
                            auction?.currentBidderId === user?.uid
                          }
                          className="flex-1 rounded-md bg-[#2A75BB] px-4 py-3 text-lg font-semibold text-white shadow-md shadow-[#2A75BB]/20 transition duration-200 hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                        >
                          {forfeitingPlayerId === user?.uid ? "Forfeiting..." : "Forfeit"}
                        </button>
                      </div>
                    )}

                    {userIsAdmin && (
                      <p className="text-sm text-slate-300">
                        Admin can start auctions but cannot bid or forfeit.
                      </p>
                    )}

                    {currentUserData && (
                      <div className="rounded-md border border-[#FFCB05]/35 bg-[#FFCB05]/10 px-3 py-2">
                        <p className="text-base font-medium text-[#FFCB05]">
                          Your Credits: {currentUserData.credits}
                        </p>
                      </div>
                    )}
                  </div>

                  <aside className="rounded-xl border border-[#2A75BB]/35 bg-neutral-950/80 p-4">
                    <p className="text-sm font-bold uppercase tracking-wide text-[#FFCB05]">
                      Forfeit Status
                    </p>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-green-300">
                        Active Players
                      </p>
                      {loadingPlayers && (
                        <p className="mt-2 text-sm text-slate-400">Loading...</p>
                      )}
                      {!loadingPlayers && activePlayerNames.length === 0 && (
                        <p className="mt-2 text-sm text-slate-400">None</p>
                      )}
                      {!loadingPlayers && activePlayerNames.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {activePlayerNames.map((username) => (
                            <li
                              key={`active-${username}`}
                              className="rounded-md bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-200"
                            >
                              {username}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-4 border-t border-slate-800 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-300">
                        Forfeited
                      </p>
                      {!loadingPlayers && forfeitedPlayerNames.length === 0 && (
                        <p className="mt-2 text-sm text-slate-400">None</p>
                      )}
                      {!loadingPlayers && forfeitedPlayerNames.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {forfeitedPlayerNames.map((username) => (
                            <li
                              key={`forfeited-${username}`}
                              className="rounded-md bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-200"
                            >
                              {username}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </aside>
                </div>

                {pokemonStats && (
                  <div className="mt-6 rounded-lg border border-[#2A75BB]/25 bg-neutral-900/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#7fc2ff]">
                      Pokemon Stats
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3 lg:grid-cols-6">
                      <p className="rounded bg-black/50 px-2 py-1 text-slate-300">
                        HP <span className="text-[#FFCB05]">{pokemonStats.hp}</span>
                      </p>
                      <p className="rounded bg-black/50 px-2 py-1 text-slate-300">
                        ATK <span className="text-[#FFCB05]">{pokemonStats.attack}</span>
                      </p>
                      <p className="rounded bg-black/50 px-2 py-1 text-slate-300">
                        DEF <span className="text-[#FFCB05]">{pokemonStats.defense}</span>
                      </p>
                      <p className="rounded bg-black/50 px-2 py-1 text-slate-300">
                        SpA <span className="text-[#FFCB05]">{pokemonStats.specialAttack}</span>
                      </p>
                      <p className="rounded bg-black/50 px-2 py-1 text-slate-300">
                        SpD <span className="text-[#FFCB05]">{pokemonStats.specialDefense}</span>
                      </p>
                      <p className="rounded bg-black/50 px-2 py-1 text-slate-300">
                        SPD <span className="text-[#FFCB05]">{pokemonStats.speed}</span>
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-[#7fc2ff]">
                      BST: <span className="font-semibold text-[#FFCB05]">{pokemonBst}</span>
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {(message || error) && (
            <div className="mt-4">
              {message && <p className="text-sm text-yellow-200">{message}</p>}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          )}

          <div className="mt-8 border-t border-slate-800 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[#FFCB05]">Players</h2>
              <div className="flex flex-wrap items-center gap-2">
                {userIsAdmin && (
                  <button
                    type="button"
                    onClick={exportAuctionResultsToExcel}
                    disabled={isExportingExcel}
                    className="rounded-md bg-[#FFCB05] px-4 py-2 text-sm font-semibold text-black shadow-md shadow-[#FFCB05]/25 transition duration-200 hover:bg-yellow-300 hover:shadow-[#FFCB05]/35 disabled:cursor-not-allowed disabled:bg-yellow-200"
                  >
                    {isExportingExcel ? "Exporting..." : "Export Excel"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowUnsoldList(true)}
                  className="rounded-md bg-[#2A75BB] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[#2A75BB]/25 transition duration-200 hover:bg-blue-500"
                >
                  Unsold List
                </button>
              </div>
            </div>

            {(loadingUsers || loadingPlayers) && (
              <p className="mt-4 text-sm text-slate-300">Loading players...</p>
            )}

            {!loadingUsers && !loadingPlayers && players.length === 0 && (
              <p className="mt-4 text-sm text-slate-300">No players joined yet.</p>
            )}

            {!loadingUsers && !loadingPlayers && players.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {players.map((player) => (
                  <button
                    key={player.userId}
                    type="button"
                    onClick={() => setSelectedUserId(player.userId)}
                    className="rounded-lg border border-[#2A75BB]/35 bg-black/60 px-4 py-3 text-left transition duration-200 hover:border-[#2A75BB] hover:bg-neutral-900"
                  >
                    <p className="font-semibold text-slate-100">{player.username}</p>
                    <p className="text-sm text-[#7fc2ff]">
                      {userCreditsById[player.userId] ?? 0} credits
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      {player.forfeited ? "Forfeited" : "Active"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
          </section>
        )}
      </section>

      <button
        type="button"
        onClick={() => setIsChatOpen((current) => !current)}
        className={`fixed z-40 rounded-full bg-[#FFCB05] px-5 py-3 text-sm font-bold uppercase tracking-wide text-black shadow-lg shadow-[#FFCB05]/35 transition duration-200 hover:bg-yellow-300 ${
          isChatOpen ? "right-5 top-5" : "bottom-5 right-5"
        }`}
      >
        {isChatOpen ? "Close Chat" : "Open Chat"}
      </button>

      <div
        className={`fixed inset-0 z-30 bg-black/80 p-4 transition-all duration-300 ${
          isChatOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        <section
          className={`mx-auto flex h-full w-full max-w-5xl flex-col rounded-2xl border border-[#2A75BB]/55 bg-neutral-950/95 p-5 shadow-2xl shadow-[#2A75BB]/25 transition-all duration-300 ${
            isChatOpen ? "translate-y-0 scale-100" : "translate-y-4 scale-[0.98]"
          }`}
        >
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-wide text-[#FFCB05]">
                PokeAuc Chat
              </h2>
              <p className="text-xs uppercase tracking-[0.2em] text-[#7fc2ff]">
                Global realtime chat
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="rounded-md border border-slate-700 px-3 py-1 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              Back to Auction
            </button>
          </div>

          <div
            ref={chatScrollRef}
            className="flex-1 space-y-3 overflow-y-auto rounded-md border border-[#2A75BB]/35 bg-black/80 p-4"
          >
            {chatMessages.length === 0 && (
              <p className="text-sm text-slate-400">No messages yet. Start the conversation.</p>
            )}
            {chatMessages.map((chat) => (
              <div
                key={chat.id}
                className="rounded-lg border border-[#2A75BB]/25 bg-neutral-900/85 px-4 py-3"
              >
                <p className="text-xs font-semibold text-[#7fc2ff]">{chat.username}</p>
                <p className="mt-1 break-words text-sm leading-6 text-slate-100">{chat.message}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2 sm:gap-3">
            <input
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Type message..."
              className="min-w-0 rounded-md border border-[#2A75BB]/40 bg-neutral-900 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-[#2A75BB] focus:ring-2 focus:ring-[#2A75BB]/35"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  sendChatMessage();
                }
              }}
            />
            <button
              type="button"
              onClick={sendChatMessage}
              disabled={sendingChat || !chatInput.trim()}
              className="rounded-md bg-[#FFCB05] px-5 py-3 text-sm font-semibold text-black shadow-md shadow-[#FFCB05]/30 transition duration-200 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-yellow-200"
            >
              Send
            </button>
          </div>
        </section>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 px-4">
          <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#2A75BB]/45 bg-neutral-900 p-6 shadow-2xl shadow-[#2A75BB]/30">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-[#FFCB05]">{selectedUser.username}</h2>
              <button
                type="button"
                onClick={() => setSelectedUserId("")}
                className="rounded-md border border-slate-700 px-3 py-1 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {selectedInventoryItems.length === 0 && (
              <p className="mt-5 text-sm text-slate-300">No Pokemon bought yet.</p>
            )}

            {selectedInventoryItems.length > 0 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {selectedInventoryItems.map((item) => {
                  const ownedPokemon = inventoryPokemon[item.pokemonId];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-950/60 p-3"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-md bg-slate-900">
                        {ownedPokemon?.image ? (
                          <img
                            src={ownedPokemon.image}
                            alt={item.pokemonName}
                            className="h-14 w-14 object-contain"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">Loading</span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-100">{item.pokemonName}</p>
                        <p className="text-sm text-[#7fc2ff]">Price: {item.purchasePrice}</p>
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
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 px-4">
          <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#2A75BB]/45 bg-neutral-900 p-6 shadow-2xl shadow-[#2A75BB]/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[#FFCB05]">Unsold Pokemon</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Pokemon that are still unsold in global live auction.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUnsoldList(false)}
                className="rounded-md border border-slate-700 px-3 py-1 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {activeUnsoldPokemonIds.length === 0 && (
              <p className="mt-5 text-sm text-slate-300">No unsold Pokemon yet.</p>
            )}

            {activeUnsoldPokemonIds.length > 0 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {activeUnsoldPokemonIds.map((pokemonId) => {
                  const unsoldItem = unsoldPokemon[pokemonId];
                  return (
                    <div
                      key={pokemonId}
                      className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-950/60 p-3"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-md bg-slate-900">
                        {unsoldItem?.image ? (
                          <img
                            src={unsoldItem.image}
                            alt={formatPokemonName(unsoldItem.name)}
                            className="h-14 w-14 object-contain"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">Loading</span>
                        )}
                      </div>
                      <p className="font-medium text-slate-100">
                        {unsoldItem ? formatPokemonName(unsoldItem.name) : `#${pokemonId}`}
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
