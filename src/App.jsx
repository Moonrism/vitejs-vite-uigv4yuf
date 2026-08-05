import React, { useEffect, useState, useMemo, useRef } from "react";
import { Trophy, Users, Check, X as XIcon, ExternalLink, RotateCcw, ChevronRight, Trash2, Sparkles, Lock } from "lucide-react";
import { supabase } from "./supabase";

/* ---------------------------------------------------------------
   TOKENS
   Court green scoreboard aesthetic: deep court green + chalk line
   cream + optic-yellow ball accent + two team colors (Ryder-Cup
   navy vs crimson, editable by the user via team name only for now).
----------------------------------------------------------------*/
const COURT = "#F5A416";
const COURT_DARK = "#080B0F";
const LINE = "#F4F7FA";
const BALL = "#F5A416";
const INK = "#080B0F";
const TEAM = {
  A: { bg: "#F5A416", soft: "#261F12", ring: "#FFB21C", text: "#FFD27A" },
  B: { bg: "#41BDF5", soft: "#10232D", ring: "#41BDF5", text: "#8EDBFF" },
};


const STORAGE_KEY = "yuko-cup-single-source-scoring-v6";
const TOURNAMENT_ID = "yuko-cup-2026";

function emptyTeams() {
  return {
    A: { name: "", captainId: null, memberIds: [] },
    B: { name: "", captainId: null, memberIds: [] },
  };
}

function normalizeResult(result) {
  if (!result) return null;

  const label = String(result.label || "");
  const winner =
    result.winner === "A" || result.winner === "B"
      ? result.winner
      : result.pointsA > result.pointsB
        ? "A"
        : result.pointsB > result.pointsA
          ? "B"
          : null;

  const scoreline =
    result.scoreline === "2-0" || result.scoreline === "2-1"
      ? result.scoreline
      : /2\s*[–—-]\s*0/.test(label)
        ? "2-0"
        : /2\s*[–—-]\s*1/.test(label)
          ? "2-1"
          : null;

  return { ...result, winner, scoreline };
}

/*
  Authoritative scoring rules

  Gendered/mixed:
    Normal 2-0 = 3 / 0
    Normal 2-1 = 2 / 1
    Winning team's clutch 2-0 = 6 / 0
    Winning team's clutch 2-1 = 4 / 2

  Dreambreaker:
    Winner = 3
    Loser = 1
*/
function calculateMatchPoints(match, rawResult) {
  const result = normalizeResult(rawResult);
  if (!result?.winner) return { pointsA: 0, pointsB: 0 };

  if (match.type === "DB") {
    return result.winner === "A"
      ? { pointsA: 3, pointsB: 1 }
      : { pointsA: 1, pointsB: 3 };
  }

  if (!result.scoreline) return { pointsA: 0, pointsB: 0 };

  const winningTeamSelectedClutch =
    (result.winner === "A" && match.clutchA) ||
    (result.winner === "B" && match.clutchB);

  if (result.winner === "A") {
    if (result.scoreline === "2-0") {
      return winningTeamSelectedClutch
        ? { pointsA: 6, pointsB: 0 }
        : { pointsA: 3, pointsB: 0 };
    }

    return winningTeamSelectedClutch
      ? { pointsA: 4, pointsB: 2 }
      : { pointsA: 2, pointsB: 1 };
  }

  if (result.scoreline === "2-0") {
    return winningTeamSelectedClutch
      ? { pointsA: 0, pointsB: 6 }
      : { pointsA: 0, pointsB: 3 };
  }

  return winningTeamSelectedClutch
    ? { pointsA: 2, pointsB: 4 }
    : { pointsA: 1, pointsB: 2 };
}

function normalizeSavedTournament(saved) {
  if (!saved?.roundsState) return saved;

  const roundsState = Object.fromEntries(
    Object.entries(saved.roundsState).map(([roundId, round]) => {
      const matches = (round.matches || []).map((match) => {
        // Keep only match facts. Stored point totals are deliberately discarded
        // because points are always derived from result + clutch selections.
        const {
          pointsA: _discardedPointsA,
          pointsB: _discardedPointsB,
          ...matchFacts
        } = match;

        return {
          ...matchFacts,
          result: normalizeResult(match.result),
        };
      });

      return [roundId, { ...round, matches }];
    })
  );

  return {
    ...saved,
    scoringVersion: "single-source-v6",
    roundsState,
  };
}

function loadSavedTournament() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return null;
    return normalizeSavedTournament(saved);
  } catch (error) {
    console.warn("Could not restore saved tournament:", error);
    return null;
  }
}

const DISPLAY_FONT = "'Barlow Condensed', sans-serif";
const MONO_FONT = "'Barlow Condensed', sans-serif";
const BODY_FONT = "'Inter', sans-serif";

let uidCounter = 0;
const uid = (p = "id") => `${p}_${(uidCounter += 1)}_${Math.random().toString(36).slice(2, 7)}`;

const MALE_NAMES = ["Paul","Graeme","Cory","Alan","Garry","Tony","Conrad","Al","Jason","Thomas","Mike","Scott","Alejandro","Jack","Derek","Eric"];
const FEMALE_NAMES = ["Vicky","Eva","Yuko","Jenn","Liberty","Rosa","Rebecca","Kate","Jordyn","Tammie","Rhonda","Shafina","Tracey","Lisa","Nayah","Ariane"];
const LAST_NAMES = ["L","W","K","H","H","T","S","C","H","J","G","N","C","W","C","R","W","G","H","V","L","H","C","A","B","G","N","H","M","E","A","W"];

function makeDemoPlayers() {
  const players = [];
  MALE_NAMES.forEach((n, i) => players.push({ id: uid("p"), first: n, last: LAST_NAMES[i], gender: "M", isCaptain: i === 0 }));
  FEMALE_NAMES.forEach((n, i) => players.push({ id: uid("p"), first: n, last: LAST_NAMES[i + 16], gender: "F", isCaptain: i === 0 }));
  return players;
}

const ROUND_META = [
  { id: 1, label: "Round 1", subtitle: "Gendered Doubles", type: "gendered", discloser: "A" },
  { id: 2, label: "Round 2", subtitle: "Gendered Doubles", type: "gendered", discloser: "B" },
  { id: 3, label: "Round 3", subtitle: "Mixed Doubles", type: "mixed", discloser: "B" },
  { id: 4, label: "Round 4", subtitle: "Mixed Doubles", type: "mixed", discloser: "A" },
  { id: 5, label: "Round 5", subtitle: "Dreambreaker", type: "dreambreaker", discloser: null },
];

const TYPE_LABEL = { M: "Men's Doubles", F: "Women's Doubles", MX: "Mixed Doubles", DB: "Dreambreaker" };

function initRoundsState() {
  const state = {};
  ROUND_META.forEach((r) => {
    state[r.id] = {
      stage: r.type === "dreambreaker" ? "assign" : "disclose",
      discloseStepIdx: 0,
      opposeStepIdx: 0,
      disclosed: {},
      opposed: {},
      discloseConfirmed: {},
      opposeConfirmed: {},
      assignDraft: r.type === "dreambreaker" ? { initialDiscloser: "", matches: [0, 1, 2, 3].map(() => ({ discloser: "", disclosed: [], opposed: [], stage: "disclose" })) } : null,
      matches: [],
    };
  });
  return state;
}

function playerName(players, id) {
  const p = players.find((pp) => pp.id === id);
  return p ? `${p.first} ${p.last}` : "—";
}

function PlayerNamesWithGreyAmpersand({ names, className = "" }) {
  return (
    <span className={className}>
      {names.map((name, index) => (
        <React.Fragment key={`${name}-${index}`}>
          {index > 0 && <span className="text-white/30"> &amp; </span>}
          <span>{name}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function genderCounts(memberIds, players) {
  let m = 0, f = 0;
  memberIds.forEach((id) => {
    const p = players.find((pp) => pp.id === id);
    if (!p) return;
    if (p.gender === "M") m += 1; else f += 1;
  });
  return { m, f };
}

/* ---------------------------------------------------------------
   ROSTER SETUP
----------------------------------------------------------------*/
function RosterSetup({ players, setPlayers, onContinue }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [gender, setGender] = useState("M");

  const captains = players.filter((p) => p.isCaptain);
  const canAdd = players.length < 32 && first.trim() && last.trim();
  const canContinue = players.length === 32 && captains.length === 2;

  function addPlayer() {
    if (!canAdd) return;
    setPlayers([...players, { id: uid("p"), first: first.trim(), last: last.trim(), gender, isCaptain: false }]);
    setFirst(""); setLast("");
  }

  function toggleCaptain(id) {
    setPlayers(players.map((p) => {
      if (p.id === id) return { ...p, isCaptain: !p.isCaptain };
      return p;
    }));
  }

  function removePlayer(id) {
    setPlayers(players.filter((p) => p.id !== id));
  }

  function loadDemo() {
    setPlayers(makeDemoPlayers());
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontFamily: DISPLAY_FONT }} className="text-2xl tracking-wide text-[#F4F7FA]">STEP 1 — ROSTER &amp; CAPTAINS</h2>
        <button onClick={loadDemo} className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#F4F7FA]/20 text-[#F4F7FA]/70 hover:bg-white/5 transition">
          <Sparkles size={13} /> Load demo roster
        </button>
      </div>

      <div className="bg-[#11161D] rounded-2xl border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,.18)] p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name"
            className="sm:col-span-1 px-3 py-2 rounded-lg bg-[#0D1117] text-[#F4F7FA] border border-[#F4F7FA]/15 focus:outline-none focus:ring-2 focus:ring-[#F5A416]/40" />
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name"
            className="sm:col-span-1 px-3 py-2 rounded-lg bg-[#0D1117] text-[#F4F7FA] border border-[#F4F7FA]/15 focus:outline-none focus:ring-2 focus:ring-[#F5A416]/40" />
          <select value={gender} onChange={(e) => setGender(e.target.value)}
            className="sm:col-span-1 px-3 py-2 rounded-lg bg-[#0D1117] text-[#F4F7FA] border border-[#F4F7FA]/15 bg-[#11161D]">
            <option value="M">Men</option>
            <option value="F">Women</option>
          </select>
          <button onClick={addPlayer} disabled={!canAdd}
            className="sm:col-span-1 px-3 py-2 rounded-lg text-white font-medium disabled:opacity-30 transition"
            style={{ backgroundColor: COURT }}>
            Add player
          </button>
        </div>
        <p className="text-xs mt-2 text-[#F4F7FA]/50">{players.length}/32 players added • {captains.length}/2 captains selected</p>
      </div>

      <div className="bg-[#11161D] rounded-2xl border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,.18)] divide-y divide-[#12241F]/8 max-h-[420px] overflow-y-auto">
        {players.length === 0 && <p className="p-5 text-sm text-[#F4F7FA]/40">No players yet — add players above, or load the demo roster to try the flow.</p>}
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                style={{ backgroundColor: p.gender === "M" ? "#142631" : "#2A2113", color: p.gender === "M" ? TEAM.A.text : TEAM.B.text }}>
                {p.gender}
              </span>
              <span className="text-sm text-[#F4F7FA]">{p.first} {p.last}</span>
              {p.isCaptain && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ backgroundColor: BALL, color: INK }}>Captain</span>}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => toggleCaptain(p.id)} disabled={!p.isCaptain && captains.length >= 2}
                className="text-xs underline disabled:no-underline disabled:opacity-30 text-[#F4F7FA]/70">
                {p.isCaptain ? "Remove captain" : "Make captain"}
              </button>
              <button onClick={() => removePlayer(p.id)} className="text-[#F4F7FA]/40 hover:text-[#FF6464]">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-5">
        <button onClick={onContinue} disabled={!canContinue}
          className="px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-30 flex items-center gap-1.5 transition"
          style={{ backgroundColor: COURT }}>
          Continue to team setup <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   TEAM SETUP
----------------------------------------------------------------*/
function TeamCard({ teamKey, captain, gc, teams, players, rename, unassign }) {
  const c = TEAM[teamKey];
  const members = teams[teamKey].memberIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  return (
    <div className="rounded-2xl border border-white/10 bg-[#11161D] shadow-[0_18px_45px_rgba(0,0,0,.18)] overflow-hidden flex-1">
      <div className="px-4 py-3" style={{ backgroundColor: c.bg }}>
        <label className="block text-[10px] uppercase tracking-wide text-white/60 mb-1">Team name</label>
        <input value={teams[teamKey].name} onChange={(e) => rename(teamKey, e.target.value)} placeholder="Enter team name"
          style={{ fontFamily: DISPLAY_FONT }}
          className="w-full bg-[#11161D]/10 border border-white/25 rounded-lg px-2.5 py-1.5 text-white placeholder-white/50 text-xl tracking-wide focus:outline-none focus:bg-[#11161D]/20 focus:border-white/60" />
        <p className="text-white/70 text-xs mt-1.5">Captain: {captain ? `${captain.first} ${captain.last}` : "—"}</p>
      </div>
      <div className="px-4 py-2 text-xs flex justify-between border-b border-[#F4F7FA]/8" style={{ color: c.text }}>
        <span>{teams[teamKey].memberIds.length + 1}/16 members</span>
        <span className={gc.m === 8 && gc.f === 8 ? "text-emerald-600" : "text-amber-600"}>Men {gc.m} · Women {gc.f}</span>
      </div>
      <div className="divide-y divide-[#12241F]/8 max-h-[260px] overflow-y-auto">
        {members.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>{p.first} {p.last} <span className="text-[#F4F7FA]/40 text-xs">({p.gender})</span></span>
            <button onClick={() => unassign(teamKey, p.id)} className="text-[#F4F7FA]/40 hover:text-[#FF6464] text-xs underline">remove</button>
          </div>
        ))}
        {members.length === 0 && <p className="px-4 py-3 text-xs text-[#F4F7FA]/40">No members assigned yet.</p>}
      </div>
    </div>
  );
}

function TeamSetup({ players, teams, setTeams, onContinue, onBack }) {
  const captains = players.filter((p) => p.isCaptain);
  const capA = captains[0], capB = captains[1];
  const unassigned = players.filter((p) => !p.isCaptain && teams.A.memberIds.indexOf(p.id) === -1 && teams.B.memberIds.indexOf(p.id) === -1);

  function assign(teamKey, playerId) {
    setTeams({ ...teams, [teamKey]: { ...teams[teamKey], memberIds: [...teams[teamKey].memberIds, playerId] } });
  }
  function unassign(teamKey, playerId) {
    setTeams({ ...teams, [teamKey]: { ...teams[teamKey], memberIds: teams[teamKey].memberIds.filter((id) => id !== playerId) } });
  }
  function rename(teamKey, name) {
    setTeams({ ...teams, [teamKey]: { ...teams[teamKey], name } });
  }

  function autoAssignEvenly() {
    const needA = { M: 8 - gcA.m, F: 8 - gcA.f };
    const needB = { M: 8 - gcB.m, F: 8 - gcB.f };
    const newA = [...teams.A.memberIds];
    const newB = [...teams.B.memberIds];

    ["M", "F"].forEach((g) => {
      const pool = shuffleArray(unassigned.filter((p) => p.gender === g));
      pool.forEach((p) => {
        const need = g === "M" ? needA.M : needA.F;
        const needOther = g === "M" ? needB.M : needB.F;
        if (need > 0) {
          newA.push(p.id);
          if (g === "M") needA.M -= 1; else needA.F -= 1;
        } else if (needOther > 0) {
          newB.push(p.id);
          if (g === "M") needB.M -= 1; else needB.F -= 1;
        } else {
          (newA.length <= newB.length ? newA : newB).push(p.id);
        }
      });
    });

    setTeams({ ...teams, A: { ...teams.A, memberIds: newA }, B: { ...teams.B, memberIds: newB } });
  }

  const fullA = teams.A.memberIds.length === 15;
  const fullB = teams.B.memberIds.length === 15;
  const gcA = genderCounts([capA?.id, ...teams.A.memberIds], players);
  const gcB = genderCounts([capB?.id, ...teams.B.memberIds], players);
  const canContinue = fullA && fullB && teams.A.name.trim() && teams.B.name.trim();

  return (
    <div className="max-w-4xl mx-auto">
      <h2 style={{ fontFamily: DISPLAY_FONT }} className="text-2xl tracking-wide text-[#F4F7FA] mb-4">STEP 2 — TEAMS</h2>

      {(!gcA.m || gcA.m !== 8 || gcA.f !== 8 || gcB.m !== 8 || gcB.f !== 8) && (fullA && fullB) && (
        <div className="mb-4 text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
          Heads up: gendered rounds need exactly 8 men and 8 women per team. Adjust assignments if a round comes up short.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <TeamCard teamKey="A" captain={capA} gc={gcA} teams={teams} players={players} rename={rename} unassign={unassign} />
        <TeamCard teamKey="B" captain={capB} gc={gcB} teams={teams} players={players} rename={rename} unassign={unassign} />
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-[#F4F7FA]/70">Unassigned players ({unassigned.length})</h3>
        <button onClick={autoAssignEvenly} disabled={unassigned.length === 0}
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#F4F7FA]/20 text-[#F4F7FA]/70 hover:bg-white/5 disabled:opacity-30 transition">
          Auto-assign remaining evenly
        </button>
      </div>
      <div className="bg-[#11161D] rounded-2xl border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,.18)] divide-y divide-[#12241F]/8 max-h-[300px] overflow-y-auto mb-6">
        {unassigned.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span>{p.first} {p.last} <span className="text-[#F4F7FA]/40 text-xs">({p.gender})</span></span>
            <div className="flex gap-2">
              <button onClick={() => assign("A", p.id)} disabled={fullA}
                className="text-xs px-2.5 py-1 rounded-full text-white disabled:opacity-30" style={{ backgroundColor: TEAM.A.bg }}>→ {teams.A.name || "Team A"}</button>
              <button onClick={() => assign("B", p.id)} disabled={fullB}
                className="text-xs px-2.5 py-1 rounded-full text-white disabled:opacity-30" style={{ backgroundColor: TEAM.B.bg }}>→ {teams.B.name || "Team B"}</button>
            </div>
          </div>
        ))}
        {unassigned.length === 0 && <p className="px-4 py-3 text-xs text-[#F4F7FA]/40">All players assigned.</p>}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="text-sm text-[#F4F7FA]/60 underline">Back to roster</button>
        <button onClick={onContinue} disabled={!canContinue}
          className="px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-30 flex items-center gap-1.5"
          style={{ backgroundColor: COURT }}>
          Continue to assign pairs <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   PAIR POOL BUILDER (click-to-pair) — used for disclose & oppose
----------------------------------------------------------------*/
function PairPoolBuilder({ roster, pattern, count, initial, onConfirm, onDraftChange, teamLabel }) {
  const [pairs, setPairsState] = useState(initial || []);
  const [pendingM, setPendingM] = useState(null);
  const [pendingSingle, setPendingSingle] = useState([]);

  function setPairs(next) {
    setPairsState(next);
    if (onDraftChange) onDraftChange(next);
  }

  const usedIds = new Set([...pairs.flat(), ...(pendingM ? [pendingM] : []), ...pendingSingle]);

  function click(playerId, gender) {
    if (usedIds.has(playerId) || pairs.length >= count) return;
    if (pattern === "MF") {
      if (gender === "M") {
        if (pendingM) return;
        setPendingM(playerId);
      } else {
        if (!pendingM) return;
        setPairs([...pairs, [pendingM, playerId]]);
        setPendingM(null);
      }
    } else {
      const next = [...pendingSingle, playerId];
      if (next.length === 2) {
        setPairs([...pairs, next]);
        setPendingSingle([]);
      } else {
        setPendingSingle(next);
      }
    }
  }

  function removePair(idx) {
    setPairs(pairs.filter((_, i) => i !== idx));
  }

  const men = roster.filter((p) => p.gender === "M");
  const women = roster.filter((p) => p.gender === "F");
  const done = pairs.length === count;

  function Pool({ list, gender, title }) {
    return (
      <div className="flex-1">
        <p className="text-xs text-[#F4F7FA]/50 mb-1.5">{title}</p>
        <div className="flex flex-wrap gap-1.5">
          {list.map((p) => {
            const used = usedIds.has(p.id);
            const isPending = p.id === pendingM || pendingSingle.indexOf(p.id) !== -1;
            return (
              <button key={p.id} disabled={used && !isPending} onClick={() => click(p.id, gender)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition ${used ? "opacity-25 cursor-not-allowed" : "hover:border-[#F5A416]"} ${isPending ? "ring-2 ring-offset-1" : ""}`}
                style={isPending ? { borderColor: COURT, ringColor: COURT } : { borderColor: "#12241F22" }}>
                {p.first} {p.last[0]}.
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#11161D] rounded-2xl border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,.18)] p-4">
      <p className="text-sm font-medium mb-3 text-[#F4F7FA]">{teamLabel} — build {count} pair{count > 1 ? "s" : ""} ({pattern === "MF" ? "one man + one woman" : pattern === "MM" ? "two men" : "two women"})</p>

      {pattern === "MF" ? (
        <div className="space-y-3 mb-4">
          <Pool list={men} gender="M" title="Men available" />
          <Pool list={women} gender="F" title="Women available" />
        </div>
      ) : (
        <div className="mb-4">
          <Pool list={pattern === "MM" ? men : women} gender={pattern === "MM" ? "M" : "F"} title="Available" />
        </div>
      )}

      <div className="space-y-1.5 mb-4">
        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#12241F0A" }}>
            <span>
              Pair {i + 1}:{" "}
              <PlayerNamesWithGreyAmpersand names={pair.map((id) => playerName(roster, id))} />
            </span>
            <button onClick={() => removePair(i)} className="text-[#F4F7FA]/40 hover:text-[#FF6464]"><Trash2 size={13} /></button>
          </div>
        ))}
        {pairs.length === 0 && <p className="text-xs text-[#F4F7FA]/40">No pairs formed yet — click players above.</p>}
      </div>

      <button onClick={() => onConfirm(pairs)} disabled={!done}
        className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-30"
        style={{ backgroundColor: COURT }}>
        Confirm pairs ({pairs.length}/{count})
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------
   MATCH CARD (result entry)
----------------------------------------------------------------*/
function MatchCard({
  match,
  teams,
  players,
  onResult,
  onClutch,
  clutchEditSide,
  selectedClutchAId,
  selectedClutchBId,
  isFocused = false,
}) {
  const c = TYPE_LABEL[match.type];
  const aPlayerNames = match.teamAIds.map((id) => playerName(players, id));
  const bPlayerNames = match.teamBIds.map((id) => playerName(players, id));
  const aNames = aPlayerNames;
  const bNames = bPlayerNames;
  const isDB = match.type === "DB";
  const isAClutch = selectedClutchAId === match.id;
  const isBClutch = selectedClutchBId === match.id;
  const canChooseA = clutchEditSide === "A";
  const canChooseB = clutchEditSide === "B";
  const displayedPoints = calculateMatchPoints(match, match.result);

  return (
    <div
      id={`match-${match.id}`}
      className={`bg-[#11161D] rounded-2xl border shadow-[0_18px_45px_rgba(0,0,0,.18)] overflow-hidden scroll-mt-28 transition-all duration-300 ${
        isFocused
          ? "border-[#F5A416] ring-2 ring-[#F5A416]/70 shadow-[0_0_30px_rgba(245,164,22,.24)]"
          : "border-white/10"
      }`}
    >
      <div className="grid grid-cols-[88px_1fr] sm:grid-cols-[96px_1fr_auto] items-stretch border-b border-white/10">
        <div className="flex flex-col items-center justify-center px-3 py-4 border-r border-white/10 bg-[#0B0F14]">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">Court</span>
          <span style={{ fontFamily: MONO_FONT, color: COURT }} className="text-5xl sm:text-6xl font-black leading-none mt-1">{match.court}</span>
        </div>

        <div className="min-w-0 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">{c}</span>
            <div className="flex items-center gap-1.5">
              {isAClutch && <span className="text-[10px] px-2 py-1 rounded-full border" style={{ color: TEAM.A.bg, borderColor: `${TEAM.A.bg}66`, backgroundColor: `${TEAM.A.bg}12` }}>★ {teams.A.name} clutch</span>}
              {isBClutch && <span className="text-[10px] px-2 py-1 rounded-full border" style={{ color: TEAM.B.bg, borderColor: `${TEAM.B.bg}66`, backgroundColor: `${TEAM.B.bg}12` }}>★ {teams.B.name} clutch</span>}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
            <div className="min-w-0 text-right">
              <p className="text-[10px] uppercase tracking-[0.14em] opacity-65 truncate" style={{ color: TEAM.A.bg }}>{teams.A.name}</p>
              {isDB ? (
                <div className="mt-1 space-y-0.5 text-base sm:text-lg font-bold leading-tight" style={{ color: TEAM.A.bg }}>
                  {aPlayerNames.map((name, index) => <p key={`${match.id}-a-${index}`} className="whitespace-normal break-words">{name}</p>)}
                </div>
              ) : (
                <p className="text-lg sm:text-xl font-bold leading-tight truncate" style={{ color: TEAM.A.bg }}>
                  <PlayerNamesWithGreyAmpersand names={aNames} />
                </p>
              )}
            </div>
            <span className="text-sm sm:text-base font-black text-white/25">VS</span>
            <div className="min-w-0 text-left">
              <p className="text-[10px] uppercase tracking-[0.14em] opacity-65 truncate" style={{ color: TEAM.B.bg }}>{teams.B.name}</p>
              {isDB ? (
                <div className="mt-1 space-y-0.5 text-base sm:text-lg font-bold leading-tight" style={{ color: TEAM.B.bg }}>
                  {bPlayerNames.map((name, index) => <p key={`${match.id}-b-${index}`} className="whitespace-normal break-words">{name}</p>)}
                </div>
              ) : (
                <p className="text-lg sm:text-xl font-bold leading-tight truncate" style={{ color: TEAM.B.bg }}>
                  <PlayerNamesWithGreyAmpersand names={bNames} />
                </p>
              )}
            </div>
          </div>
        </div>

        {(canChooseA || canChooseB) && (
          <div className="col-span-2 sm:col-span-1 flex sm:flex-col justify-center gap-2 px-3 py-3 border-t sm:border-t-0 sm:border-l border-white/10 bg-[#0D1218]">
            {canChooseA && (
              <button
                onClick={() => onClutch(match.id, "A")}
                className="text-xs px-3 py-2 rounded-lg border font-medium whitespace-nowrap hover:bg-white/5"
                style={{ color: TEAM.A.bg, borderColor: `${TEAM.A.bg}77` }}
              >
                Select for {teams.A.name}
              </button>
            )}
            {canChooseB && (
              <button
                onClick={() => onClutch(match.id, "B")}
                className="text-xs px-3 py-2 rounded-lg border font-medium whitespace-nowrap hover:bg-white/5"
                style={{ color: TEAM.B.bg, borderColor: `${TEAM.B.bg}77` }}
              >
                Select for {teams.B.name}
              </button>
            )}
          </div>
        )}
      </div>

      {match.result ? (
        <div className="px-4 py-3 flex items-center justify-between gap-3 bg-[#0D1218]">
          <p className="text-sm min-w-0 truncate">
            <span style={{ fontFamily: MONO_FONT }}>{match.result.label}</span>
            <span className="text-white/35"> · </span>
            <span style={{ color: TEAM.A.bg }}>{teams.A.name} +{displayedPoints.pointsA}</span>
            <span className="text-white/35"> / </span>
            <span style={{ color: TEAM.B.bg }}>{teams.B.name} +{displayedPoints.pointsB}</span>
          </p>
          <button onClick={() => onResult(match.id, null)} className="text-xs underline text-white/50 shrink-0">Change result</button>
        </div>
      ) : isDB ? (
        <div className="px-4 py-3 grid grid-cols-2 gap-2 bg-[#0D1218]">
          <button onClick={() => onResult(match.id, { label: `${teams.A.name} win`, winner: "A" })}
            className="text-sm py-2.5 rounded-lg text-white font-medium" style={{ backgroundColor: TEAM.A.bg }}>{teams.A.name} wins</button>
          <button onClick={() => onResult(match.id, { label: `${teams.B.name} win`, winner: "B" })}
            className="text-sm py-2.5 rounded-lg text-white font-medium" style={{ backgroundColor: TEAM.B.bg }}>{teams.B.name} wins</button>
        </div>
      ) : (
        <div className="px-4 py-3 bg-[#0D1218]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Record game result</p>
            <p className="text-[10px] text-white/35">Normal: 3–0 or 2–1 · Clutch: 6–0 or 4–2</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onResult(match.id, { label: `${teams.A.name} 2–0`, winner: "A", scoreline: "2-0" })}
              className="text-sm py-2.5 rounded-lg text-white font-medium" style={{ backgroundColor: TEAM.A.bg }}>{teams.A.name} wins 2–0</button>
            <button onClick={() => onResult(match.id, { label: `${teams.B.name} 2–0`, winner: "B", scoreline: "2-0" })}
              className="text-sm py-2.5 rounded-lg text-white font-medium" style={{ backgroundColor: TEAM.B.bg }}>{teams.B.name} wins 2–0</button>
            <button onClick={() => onResult(match.id, { label: `${teams.A.name} 2–1`, winner: "A", scoreline: "2-1" })}
              className="text-sm py-2.5 rounded-lg border font-medium" style={{ borderColor: TEAM.A.bg, color: TEAM.A.bg }}>{teams.A.name} wins 2–1</button>
            <button onClick={() => onResult(match.id, { label: `${teams.B.name} 2–1`, winner: "B", scoreline: "2-1" })}
              className="text-sm py-2.5 rounded-lg border font-medium" style={{ borderColor: TEAM.B.bg, color: TEAM.B.bg }}>{teams.B.name} wins 2–1</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   DREAMBREAKER ASSIGNMENT
----------------------------------------------------------------*/
function DreambreakerAssign({ teams, players, draft, onChange, createdMatches = [], onMatchNavigate }) {
  const rosterIds = {
    A: [teams.A.captainId, ...teams.A.memberIds],
    B: [teams.B.captainId, ...teams.B.memberIds],
  };

  const initial = draft.initialDiscloser;
  const currentMatchIdx = draft.matches.findIndex((m) => m.stage !== "complete");
  const activeIdx = currentMatchIdx === -1 ? 3 : currentMatchIdx;
  const active = draft.matches[activeIdx];

  function freshMatches(teamKey = "") {
    return [0, 1, 2, 3].map((_, i) => ({
      discloser: teamKey ? (i % 2 === 0 ? teamKey : (teamKey === "A" ? "B" : "A")) : "",
      disclosed: [],
      opposed: [],
      stage: "disclose",
    }));
  }

  function chooseInitial(teamKey) {
    onChange({ initialDiscloser: teamKey, matches: freshMatches(teamKey) }, { resetMatches: true });
  }

  function usedByTeam(teamKey, beforeIdx) {
    const used = new Set();
    draft.matches.slice(0, beforeIdx).forEach((m) => {
      if (m.discloser === teamKey) m.disclosed.forEach((id) => used.add(id));
      else m.opposed.forEach((id) => used.add(id));
    });
    return used;
  }

  function togglePlayer(teamKey, id) {
    if (!initial || active.stage === "complete") return;
    const field = active.stage === "disclose" ? "disclosed" : "opposed";
    const selectingTeam = active.stage === "disclose" ? active.discloser : (active.discloser === "A" ? "B" : "A");
    if (teamKey !== selectingTeam) return;
    const selected = active[field];
    const nextSelected = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : selected.length < 4 ? [...selected, id] : selected;
    const matches = draft.matches.map((m, i) => i === activeIdx ? { ...m, [field]: nextSelected } : m);
    onChange({ ...draft, matches });
  }

  function confirmCurrentSelection() {
    const field = active.stage === "disclose" ? "disclosed" : "opposed";
    if (active[field].length !== 4) return;
    const completingMatch = active.stage === "oppose";
    const matches = draft.matches.map((m, i) => {
      if (i !== activeIdx) return m;
      return active.stage === "disclose" ? { ...m, stage: "oppose" } : { ...m, stage: "complete" };
    });
    const nextDraft = { ...draft, matches };
    onChange(nextDraft, completingMatch ? { lockedMatchIndex: activeIdx, lockedSlot: matches[activeIdx] } : undefined);
  }

  const allComplete = draft.matches.every((m) => m.stage === "complete");

  if (!initial) {
    return (
      <div className="bg-[#11161D] rounded-2xl border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,.18)] p-5">
        <h3 className="font-medium text-[#F4F7FA] mb-1">Choose who discloses first</h3>
        <p className="text-xs text-[#F4F7FA]/50 mb-4">The teams alternate disclosure for all four Dreambreaker matches. Every team member can be used only once in Round 5.</p>
        <div className="grid grid-cols-2 gap-3">
          {["A", "B"].map((key) => (
            <button key={key} onClick={() => chooseInitial(key)} className="py-3 rounded-lg text-white font-medium" style={{ backgroundColor: TEAM[key].bg }}>
              {teams[key].name} discloses Match 1
            </button>
          ))}
        </div>
      </div>
    );
  }

  const selectingTeam = active.stage === "disclose" ? active.discloser : (active.discloser === "A" ? "B" : "A");
  const field = active.stage === "disclose" ? "disclosed" : "opposed";
  const used = usedByTeam(selectingTeam, activeIdx);
  const selected = active[field];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[#F4F7FA]/50">Alternating disclosure • four players per match • no repeat players</p>
          <p className="text-sm font-medium text-[#F4F7FA]">{teams[initial].name} discloses Matches 1 and 3; {teams[initial === "A" ? "B" : "A"].name} discloses Matches 2 and 4.</p>
        </div>
        <button onClick={() => onChange({ initialDiscloser: "", matches: freshMatches() }, { resetMatches: true })} className="text-xs underline text-[#F4F7FA]/50">Change first team</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {draft.matches.map((m, i) => {
          const createdMatch = createdMatches[i];
          const canNavigate = m.stage === "complete" && Boolean(createdMatch);
          const content = (
            <>
              <p className="font-medium">Match {i + 1}</p>
              <p className="text-[#F4F7FA]/50">{teams[m.discloser]?.name || "—"} discloses</p>
              <p className="mt-1">{m.stage === "complete" ? "✓ Match created" : i === activeIdx ? "In progress" : "Waiting"}</p>
            </>
          );

          return canNavigate ? (
            <button
              key={i}
              type="button"
              onClick={() => onMatchNavigate?.(createdMatch.id)}
              title={`Go to Match ${i + 1} card`}
              className={`rounded-lg border p-2 text-xs text-left transition hover:bg-white/5 hover:border-[#F5A416] focus:outline-none focus:ring-2 focus:ring-[#F5A416] ${i === activeIdx && !allComplete ? "ring-2 ring-offset-1" : ""}`}
              style={{ borderColor: BALL, ringColor: COURT }}
            >
              {content}
            </button>
          ) : (
            <div key={i} className={`rounded-lg border p-2 text-xs ${i === activeIdx && !allComplete ? "ring-2 ring-offset-1" : ""}`} style={{ borderColor: m.stage === "complete" ? BALL : "#12241F22", ringColor: COURT }}>
              {content}
            </div>
          );
        })}
      </div>

      {!allComplete && (
        <div className="bg-[#11161D] rounded-2xl border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,.18)] p-4">
          <h3 className="font-medium text-[#F4F7FA]">Match {activeIdx + 1}: {teams[selectingTeam].name} {active.stage === "disclose" ? "discloses four players" : "matches four players against the disclosed lineup"}</h3>
          {active.stage === "oppose" && (
            <div className="mt-3 mb-4 rounded-lg bg-[#F7F5EF] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[#F4F7FA]/45 mb-1">Disclosed lineup</p>
              <p className="text-sm" style={{ color: TEAM[active.discloser].bg }}>{active.disclosed.map((id) => playerName(players, id)).join(" • ")}</p>
            </div>
          )}
          <p className="text-xs text-[#F4F7FA]/50 mt-1 mb-3">Select 4 players. Players already used in an earlier Dreambreaker match are unavailable.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {rosterIds[selectingTeam].map((id) => {
              const isUsed = used.has(id);
              const isSelected = selected.includes(id);
              return (
                <button key={id} disabled={isUsed} onClick={() => togglePlayer(selectingTeam, id)}
                  className={`text-xs px-3 py-2 rounded-full border transition ${isSelected ? "text-white" : "bg-[#11161D]"} ${isUsed ? "opacity-25 cursor-not-allowed" : ""}`}
                  style={isSelected ? { backgroundColor: TEAM[selectingTeam].bg, borderColor: TEAM[selectingTeam].bg } : { color: TEAM[selectingTeam].bg, borderColor: `${TEAM[selectingTeam].bg}44` }}>
                  {playerName(players, id)}
                </button>
              );
            })}
          </div>
          <button onClick={confirmCurrentSelection} disabled={selected.length !== 4} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-30" style={{ backgroundColor: COURT }}>
            {active.stage === "disclose" ? "Confirm disclosed four" : activeIdx < 3 ? `Lock Match ${activeIdx + 1} and continue` : "Lock Match 4"} ({selected.length}/4)
          </button>
        </div>
      )}

      {allComplete && (
        <div className="bg-[#11161D] rounded-2xl border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,.18)] p-4">
          <h3 className="font-medium">All four Dreambreaker matchups are locked and ready to play.</h3>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   ROUND PANEL
----------------------------------------------------------------*/
function RoundPanel({ meta, roundState, teams, players, updateRound }) {
  const discloserKey = meta.discloser;
  const opposerKey = discloserKey === "A" ? "B" : "A";
  const discloserRoster = discloserKey ? [teams[discloserKey].captainId, ...teams[discloserKey].memberIds].map((id) => players.find((p) => p.id === id)) : [];
  const opposerRoster = discloserKey ? [teams[opposerKey].captainId, ...teams[opposerKey].memberIds].map((id) => players.find((p) => p.id === id)) : [];
  const [editing, setEditing] = useState(null); // { side: 'disclose'|'oppose', key: 'M'|'F'|'MX' } | null
  const [clutchEditSide, setClutchEditSide] = useState(null); // "A" | "B" | null
  const [focusedMatchId, setFocusedMatchId] = useState(null);

  function focusMatch(matchId) {
    if (!matchId) return;
    setFocusedMatchId(matchId);
    requestAnimationFrame(() => {
      document.getElementById(`match-${matchId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    window.setTimeout(() => {
      setFocusedMatchId((current) => current === matchId ? null : current);
    }, 2200);
  }

  function matchForConfirmedPair(stepKey, pairIndex) {
    return roundState.matches.filter((match) => match.type === stepKey)[pairIndex] || null;
  }

  function buildMatchesGendered(disclosed, opposed) {
    const matches = [];
    let court = 1;
    ["M", "F"].forEach((g) => {
      disclosed[g].forEach((pair, i) => {
        const oppPair = opposed[g][i];
        const teamAIds = discloserKey === "A" ? pair : oppPair;
        const teamBIds = discloserKey === "A" ? oppPair : pair;
        matches.push({ id: uid("m"), type: g, court: court++, teamAIds, teamBIds, result: null, clutchA: false, clutchB: false });
      });
    });
    return matches;
  }

  function buildMatchesMixed(disclosed, opposed) {
    return disclosed.MX.map((pair, i) => {
      const oppPair = opposed.MX[i];
      const teamAIds = discloserKey === "A" ? pair : oppPair;
      const teamBIds = discloserKey === "A" ? oppPair : pair;
      return { id: uid("m"), type: "MX", court: i + 1, teamAIds, teamBIds, result: null, clutchA: false, clutchB: false };
    });
  }

  // Rebuilds the full match list from current disclosed/opposed pairs, preserving court numbers and any
  // already-entered results for match types that weren't touched by this edit.
  function regenerateMatches(disclosed, opposed, preserveTypes) {
    const fresh = meta.type === "gendered" ? buildMatchesGendered(disclosed, opposed) : buildMatchesMixed(disclosed, opposed);
    if (!roundState.matches.length) return fresh;
    const oldByType = {};
    roundState.matches.forEach((m) => { (oldByType[m.type] = oldByType[m.type] || []).push(m); });
    const seenByType = {};
    return fresh.map((m) => {
      if (!preserveTypes.includes(m.type)) return m;
      const i = seenByType[m.type] || 0;
      seenByType[m.type] = i + 1;
      const old = oldByType[m.type] && oldByType[m.type][i];
      if (old && old.result) {
        return {
          ...m,
          id: old.id,
          result: normalizeResult(old.result),
          clutchA: !!old.clutchA,
          clutchB: !!old.clutchB,
        };
      }
      return m;
    });
  }

  function handleResult(matchId, result) {
    const matches = roundState.matches.map((match) =>
      match.id === matchId
        ? { ...match, result: normalizeResult(result) }
        : match
    );
    updateRound({ ...roundState, matches });
  }

  function handleClutch(matchId, side) {
    const field = side === "A" ? "clutchA" : "clutchB";
    const matches = roundState.matches.map((match) => ({
      ...match,
      [field]: match.id === matchId,
    }));
    updateRound({ ...roundState, matches });
    setClutchEditSide(null);
  }

  function renderClutchControl() {
    const selectedA = roundState.matches.find((m) => m.clutchA);
    const selectedB = roundState.matches.find((m) => m.clutchB);
    const selectedName = (match, side) => {
      if (!match) return "Not selected";
      const ids = side === "A" ? match.teamAIds : match.teamBIds;
      return (
        <>
          Court {match.court} <span className="text-white/25">·</span>{" "}
          <PlayerNamesWithGreyAmpersand names={ids.map((id) => playerName(players, id))} />
        </>
      );
    };

    return (
      <div className="mb-4 rounded-2xl border border-white/10 bg-[#0D1218] p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Clutch match</p>
            <p className="text-xs text-white/50 mt-1">Each team selects one match. If that team wins, clutch scoring applies: 2–0 awards 6–0 and 2–1 awards 4–2.</p>
          </div>
          {clutchEditSide && (
            <button onClick={() => setClutchEditSide(null)} className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-white/60">Cancel</button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {(["A", "B"]).map((side) => {
            const selected = side === "A" ? selectedA : selectedB;
            const isEditing = clutchEditSide === side;
            return (
              <div key={side} className="rounded-xl border p-3 bg-[#11161D]" style={{ borderColor: `${TEAM[side].bg}44` }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.12em] font-semibold" style={{ color: TEAM[side].bg }}>{teams[side].name}</p>
                    <p className="text-sm text-white mt-1 truncate">{selectedName(selected, side)}</p>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => setClutchEditSide(side)}
                      className="text-xs px-3 py-2 rounded-lg border shrink-0"
                      style={{ color: TEAM[side].bg, borderColor: `${TEAM[side].bg}66` }}
                    >
                      {selected ? "Edit clutch" : "Choose clutch"}
                    </button>
                  )}
                  {isEditing && <span className="text-[10px] uppercase tracking-wide text-white/45 shrink-0">Choose below</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (meta.type === "dreambreaker") {
    const handleDreambreakerDraftChange = (draft, action) => {
      let matches = roundState.matches;

      if (action?.resetMatches) {
        matches = [];
      } else if (action?.lockedSlot) {
        const slot = action.lockedSlot;
        const i = action.lockedMatchIndex;
        const teamAIds = slot.discloser === "A" ? slot.disclosed : slot.opposed;
        const teamBIds = slot.discloser === "B" ? slot.disclosed : slot.opposed;
        const existing = matches[i];
        const createdMatch = {
          id: existing?.id || uid("m"),
          type: "DB",
          court: i + 1,
          teamAIds,
          teamBIds,
          result: normalizeResult(existing?.result || null),
          clutchA: false,
          clutchB: false,
        };
        matches = [...matches];
        matches[i] = createdMatch;
      }

      updateRound({ ...roundState, stage: "assign", assignDraft: draft, matches });
    };

    return (
      <div className="space-y-5">
        <DreambreakerAssign
          teams={teams}
          players={players}
          draft={roundState.assignDraft}
          onChange={handleDreambreakerDraftChange}
          createdMatches={roundState.matches}
          onMatchNavigate={focusMatch}
        />

        {roundState.matches.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Created Round 5 matches</p>
                <p className="text-xs text-white/50 mt-1">Each Dreambreaker match is 4 versus 4. The winner receives 3 points and the losing team receives 1 point.</p>
              </div>
              <a href="https://kc-dreambreaker.stackblitz.io" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-[#F4F7FA]/20 hover:bg-white/5 shrink-0">
                <ExternalLink size={14} /> Open Dreambreaker admin tool
              </a>
            </div>
            <div className="grid gap-3">
              {roundState.matches.filter(Boolean).map((m) => <MatchCard
                key={m.id}
                match={m}
                teams={teams}
                players={players}
                onResult={handleResult}
                onClutch={handleClutch}
                clutchEditSide={null}
                selectedClutchAId={null}
                selectedClutchBId={null}
                isFocused={focusedMatchId === m.id}
              />)}
            </div>
          </div>
        )}
      </div>
    );
  }

  const steps = meta.type === "gendered" ? [{ key: "M", pattern: "MM", count: 4, label: "Men's" }, { key: "F", pattern: "FF", count: 4, label: "Women's" }] : [{ key: "MX", pattern: "MF", count: 8, label: "Mixed" }];

  function handleConfirmKey(side, key, pairs) {
    const isEditingThis = editing && editing.side === side && editing.key === key;
    const preserveTypes = steps.map((s) => s.key).filter((k) => k !== key);
    if (side === "disclose") {
      const nextDisclosed = { ...roundState.disclosed, [key]: pairs };
      const nextConfirmed = { ...roundState.discloseConfirmed, [key]: true };
      if (isEditingThis) {
        const matches = roundState.stage === "play" ? regenerateMatches(nextDisclosed, roundState.opposed, preserveTypes) : roundState.matches;
        updateRound({ ...roundState, disclosed: nextDisclosed, discloseConfirmed: nextConfirmed, matches });
        setEditing(null);
        return;
      }
      const stepIdx = roundState.discloseStepIdx;
      if (stepIdx + 1 < steps.length) {
        updateRound({ ...roundState, disclosed: nextDisclosed, discloseConfirmed: nextConfirmed, discloseStepIdx: stepIdx + 1 });
      } else {
        updateRound({ ...roundState, disclosed: nextDisclosed, discloseConfirmed: nextConfirmed, stage: "oppose" });
      }
    } else {
      const nextOpposed = { ...roundState.opposed, [key]: pairs };
      const nextConfirmed = { ...roundState.opposeConfirmed, [key]: true };
      if (isEditingThis) {
        const matches = roundState.stage === "play" ? regenerateMatches(roundState.disclosed, nextOpposed, preserveTypes) : roundState.matches;
        updateRound({ ...roundState, opposed: nextOpposed, opposeConfirmed: nextConfirmed, matches });
        setEditing(null);
        return;
      }
      const stepIdx = roundState.opposeStepIdx;
      if (stepIdx + 1 < steps.length) {
        updateRound({ ...roundState, opposed: nextOpposed, opposeConfirmed: nextConfirmed, opposeStepIdx: stepIdx + 1 });
      } else {
        const matches = meta.type === "gendered" ? buildMatchesGendered(roundState.disclosed, nextOpposed) : buildMatchesMixed(roundState.disclosed, nextOpposed);
        updateRound({ ...roundState, opposed: nextOpposed, opposeConfirmed: nextConfirmed, matches, stage: "play" });
      }
    }
  }

  function renderGroupCell(side, step) {
    const isDisclose = side === "disclose";
    const sideTeamKey = isDisclose ? discloserKey : opposerKey;
    const roster = isDisclose ? discloserRoster : opposerRoster;
    const collected = isDisclose ? roundState.disclosed : roundState.opposed;
    const confirmedFlags = isDisclose ? roundState.discloseConfirmed : roundState.opposeConfirmed;
    const sideStage = isDisclose ? "disclose" : "oppose";
    const stepIdx = isDisclose ? roundState.discloseStepIdx : roundState.opposeStepIdx;
    const sideStarted = isDisclose || roundState.stage === "oppose" || roundState.stage === "play";
    const teamLabel = isDisclose ? `${teams[discloserKey].name} discloses` : `${teams[opposerKey].name} pairs against the disclosed matchups`;

    const confirmedPairs = collected[step.key];
    const isConfirmed = !!confirmedFlags[step.key];
    const isEditingThis = editing && editing.side === side && editing.key === step.key;
    const isActiveAuto = !editing && sideStarted && roundState.stage === sideStage && steps[stepIdx] && steps[stepIdx].key === step.key && !isConfirmed;

    if (!sideStarted) {
      return (
        <div className="rounded-lg border border-dashed border-[#F4F7FA]/15 px-4 py-3 text-xs text-[#F4F7FA]/35 h-full flex items-center">
          Waiting for {teams[discloserKey].name} to disclose {step.label.toLowerCase()} pairs first
        </div>
      );
    }

    if (isConfirmed && !isEditingThis) {
      return (
        <div className="rounded-lg border border-[#F4F7FA]/10 bg-[#11161D] px-4 py-3 h-full">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-[#F4F7FA]/70">Confirmed</p>
            <button onClick={() => setEditing({ side, key: step.key })} className="text-xs underline text-[#F4F7FA]/50">Edit</button>
          </div>
          <div className="space-y-1">
            {confirmedPairs.map((pair, i) => {
              const linkedMatch = matchForConfirmedPair(step.key, i);
              const courtNumber = linkedMatch?.court ?? (step.key === "F" ? 5 + i : i + 1);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => focusMatch(linkedMatch?.id)}
                  disabled={!linkedMatch}
                  title={linkedMatch ? `Go to Court ${courtNumber} match` : "Match cards appear once all pairings are confirmed"}
                  className={`block w-full text-left text-sm rounded px-1 py-0.5 transition ${
                    linkedMatch
                      ? "hover:bg-white/[0.05] cursor-pointer"
                      : "cursor-default"
                  }`}
                  style={{ color: TEAM[sideTeamKey].bg }}
                >
                  <span className="font-semibold text-white/50">Court {courtNumber}</span>
                  <span className="text-white/25 mx-1.5">•</span>
                  <PlayerNamesWithGreyAmpersand names={pair.map((id) => playerName(roster, id))} />
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (isEditingThis || isActiveAuto) {
      return (
        <div>
          {isEditingThis && (
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-[#F4F7FA]/50">Editing {step.label.toLowerCase()} pairs</p>
              <button onClick={() => setEditing(null)} className="text-xs underline text-[#F4F7FA]/50">Cancel</button>
            </div>
          )}
          <PairPoolBuilder
            key={`${side}-${step.key}-${isEditingThis ? "edit" : "auto"}`}
            roster={roster}
            pattern={step.pattern}
            count={step.count}
            initial={confirmedPairs}
            onConfirm={(pairs) => handleConfirmKey(side, step.key, pairs)}
            onDraftChange={isEditingThis ? undefined : (pairs) => updateRound(isDisclose
              ? { ...roundState, disclosed: { ...collected, [step.key]: pairs } }
              : { ...roundState, opposed: { ...collected, [step.key]: pairs } })}
            teamLabel={teamLabel}
          />
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-dashed border-[#F4F7FA]/15 px-4 py-3 text-xs text-[#F4F7FA]/35 h-full flex items-center">
        {step.label} pairs — up next
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 mb-3 items-center">
        <p className="text-[11px] font-medium uppercase tracking-wide truncate" style={{ color: TEAM[discloserKey].bg }}>{teams[discloserKey].name} — discloses first</p>
        <span className="text-xs font-bold text-[#F4F7FA]/25">VS</span>
        <p className="text-[11px] font-medium uppercase tracking-wide text-right truncate" style={{ color: TEAM[opposerKey].bg }}>{teams[opposerKey].name} — pairs against disclosure</p>
      </div>

      {steps.map((step) => (
        <div key={step.key} className="mb-4">
          {steps.length > 1 && <p className="text-[10px] uppercase tracking-wide text-[#F4F7FA]/40 mb-1.5">{step.label} pairs</p>}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
            {renderGroupCell("disclose", step)}
            <span className="flex items-center justify-center text-xs font-bold text-[#F4F7FA]/20">VS</span>
            {renderGroupCell("oppose", step)}
          </div>
        </div>
      ))}

      {roundState.stage === "play" && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[#F4F7FA]/50 mb-3">Matches</p>
          {renderClutchControl()}
          <div className="grid gap-3">
            {roundState.matches.map((m) => <MatchCard
            key={m.id}
            match={m}
            teams={teams}
            players={players}
            onResult={handleResult}
            onClutch={handleClutch}
            clutchEditSide={clutchEditSide}
            selectedClutchAId={roundState.matches.find((x) => x.clutchA)?.id}
            selectedClutchBId={roundState.matches.find((x) => x.clutchB)?.id}
          />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   SCOREBOARD
----------------------------------------------------------------*/
function Scoreboard({ teams, roundsState }) {
  let totalA = 0, totalB = 0;
  Object.values(roundsState).forEach((round) =>
    round.matches.forEach((match) => {
      const points = calculateMatchPoints(match, match.result);
      totalA += points.pointsA;
      totalB += points.pointsB;
    })
  );

  return (
    <section
      className="border-b border-white/10"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 99999,
        isolation: "isolate",
        overflow: "hidden",
        backgroundColor: "#080B0F",
        backgroundImage: "linear-gradient(#080B0F, #080B0F)",
        opacity: 1,
        transform: "translateZ(0)",
        boxShadow: "0 12px 30px rgba(0,0,0,0.72)",
      }}
    >
      <div
        className="max-w-6xl mx-auto px-4 py-3 sm:py-4"
        style={{ backgroundColor: "#080B0F", opacity: 1 }}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:gap-6">
          <div className="text-center sm:text-right min-w-0">
            <div
              className="text-sm sm:text-xl font-black uppercase tracking-[0.06em] truncate"
              style={{ fontFamily: DISPLAY_FONT, color: TEAM.A.bg }}
              title={teams.A.name || "Team A"}
            >
              {teams.A.name || "TEAM A"}
            </div>
            <div
              className="text-7xl sm:text-9xl font-black leading-[0.82] mt-1 tabular-nums"
              style={{ fontFamily: DISPLAY_FONT, color: TEAM.A.bg, textShadow: `0 0 30px ${TEAM.A.bg}33` }}
            >
              {totalA}
            </div>
          </div>

          <div
            style={{ fontFamily: DISPLAY_FONT }}
            className="pb-2 sm:pb-4 px-1 sm:px-3 text-3xl sm:text-5xl font-black text-white/85"
            aria-label="score separator"
          >
            –
          </div>

          <div className="text-center sm:text-left min-w-0">
            <div
              className="text-sm sm:text-xl font-black uppercase tracking-[0.06em] truncate"
              style={{ fontFamily: DISPLAY_FONT, color: TEAM.B.bg }}
              title={teams.B.name || "Team B"}
            >
              {teams.B.name || "TEAM B"}
            </div>
            <div
              className="text-7xl sm:text-9xl font-black leading-[0.82] mt-1 tabular-nums"
              style={{ fontFamily: DISPLAY_FONT, color: TEAM.B.bg, textShadow: `0 0 30px ${TEAM.B.bg}33` }}
            >
              {totalB}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RoundTabs({ activeRound, setActiveRound, roundsState, allowedRoundIds = [1,2,3,4,5] }) {
  const visibleRounds = ROUND_META.filter((r) => allowedRoundIds.includes(r.id));

  return (
    <div
      className="grid gap-1.5 sm:gap-2 mb-6"
      style={{ gridTemplateColumns: `repeat(${visibleRounds.length}, minmax(0, 1fr))` }}
    >
      {visibleRounds.map((r) => {
        const rs = roundsState[r.id];
        const complete = rs.matches.length > 0 && rs.matches.every((m) => m.result);
        const active = activeRound === r.id;

        return (
          <button
            key={r.id}
            onClick={() => setActiveRound(r.id)}
            className={`relative min-h-[54px] sm:min-h-[60px] rounded-lg border px-1.5 sm:px-2 py-2 text-center transition-all ${active ? "bg-[#18170F]" : "bg-[#0E1319] hover:bg-[#121820]"}`}
            style={active
              ? { borderColor: TEAM.A.bg, boxShadow: `0 0 0 1px ${TEAM.A.bg}55, 0 0 18px ${TEAM.A.bg}20` }
              : { borderColor: "rgba(255,255,255,.14)" }}
            aria-label={`${r.label}: ${r.subtitle}`}
          >
            <div
              className="absolute right-1.5 top-1.5 text-xs sm:text-sm leading-none"
              style={{ color: complete ? "#39D47A" : active ? TEAM.A.bg : "rgba(255,255,255,.35)" }}
            >
              {complete ? "✓" : active ? "▶" : "○"}
            </div>
            <div
              style={{ fontFamily: DISPLAY_FONT }}
              className={`text-sm sm:text-lg font-bold ${active ? "text-white" : "text-white/65"}`}
            >
              R{r.id}
            </div>
            <div
              className="mt-0.5 truncate text-[7px] sm:text-[9px] uppercase tracking-[0.08em] sm:tracking-[0.13em]"
              style={{ color: r.id === 5 ? "#A875FF" : active ? TEAM.A.bg : "rgba(255,255,255,.42)" }}
              title={r.id === 5 ? "Dreambreaker" : r.subtitle.replace(" Doubles", "")}
            >
              {r.id === 5 ? "Dreambreaker" : r.subtitle.replace(" Doubles", "")}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------
   APP
----------------------------------------------------------------*/
export default function App() {
  const [phase, setPhase] = useState("roster");
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState(emptyTeams());
  const [roundsState, setRoundsState] = useState(initRoundsState());
  const [activeRound, setActiveRound] = useState(1);
  const [pairingRoundIdx, setPairingRoundIdx] = useState(1);
  const [saveStatus, setSaveStatus] = useState("Connecting to shared tournament…");
  const [cloudReady, setCloudReady] = useState(false);

  // Prevent a state update received from Supabase from immediately being
  // written back to Supabase as a duplicate update.
  const applyingRemoteUpdate = useRef(false);

  function applyTournamentState(rawState) {
    if (!rawState || typeof rawState !== "object") return;

    const saved = normalizeSavedTournament(rawState);

    if (saved.phase) setPhase(saved.phase);
    if (Array.isArray(saved.players)) setPlayers(saved.players);
    if (saved.teams) setTeams(saved.teams);
    if (saved.roundsState) setRoundsState(saved.roundsState);
    if (saved.activeRound) setActiveRound(saved.activeRound);
    if (saved.pairingRoundIdx) setPairingRoundIdx(saved.pairingRoundIdx);
  }

  // Step 9: load the shared tournament from Supabase when the app opens.
  useEffect(() => {
    let cancelled = false;

    async function loadTournament() {
      setSaveStatus("Loading shared tournament…");

      const { data, error } = await supabase
        .from("tournaments")
        .select("state")
        .eq("id", TOURNAMENT_ID)
        .single();

      if (cancelled) return;

      if (error) {
        console.error("Unable to load tournament:", error);
        setSaveStatus("Cloud load failed — changes are not synchronized");
        setCloudReady(true);
        return;
      }

      if (data?.state && Object.keys(data.state).length > 0) {
        applyingRemoteUpdate.current = true;
        applyTournamentState(data.state);
      }

      setCloudReady(true);
      setSaveStatus("Shared tournament connected");
    }

    loadTournament();

    return () => {
      cancelled = true;
    };
  }, []);

  // Step 10: listen for updates made on other devices.
  useEffect(() => {
    if (!cloudReady) return undefined;

    const channel = supabase
      .channel(`tournament-${TOURNAMENT_ID}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournaments",
          filter: `id=eq.${TOURNAMENT_ID}`,
        },
        (payload) => {
          const incomingState = payload.new?.state;
          if (!incomingState) return;

          applyingRemoteUpdate.current = true;
          applyTournamentState(incomingState);
          setSaveStatus("Updated from another device");
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSaveStatus("Live synchronization active");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cloudReady]);

  // Save changes to Supabase after a short delay.
  useEffect(() => {
    if (!cloudReady) return undefined;

    if (applyingRemoteUpdate.current) {
      applyingRemoteUpdate.current = false;
      return undefined;
    }

    const snapshot = {
      version: 6,
      scoringVersion: "single-source-v6",
      savedAt: new Date().toISOString(),
      phase,
      players,
      teams,
      roundsState,
      activeRound,
      pairingRoundIdx,
    };

    const timer = window.setTimeout(async () => {
      setSaveStatus("Saving shared tournament…");

      const { error } = await supabase
        .from("tournaments")
        .upsert(
          {
            id: TOURNAMENT_ID,
            name: "The Yuko Cup",
            state: snapshot,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (error) {
        console.error("Unable to save tournament:", error);
        setSaveStatus("Cloud save failed");
        return;
      }

      // Optional local backup only. Supabase remains the source of truth.
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch (localError) {
        console.warn("Could not create local backup:", localError);
      }

      setSaveStatus("Saved and synchronized");
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    cloudReady,
    phase,
    players,
    teams,
    roundsState,
    activeRound,
    pairingRoundIdx,
  ]);

  function goToTeams() {
    const captains = players.filter((p) => p.isCaptain);
    setTeams({
      A: { name: teams.A.name, captainId: captains[0]?.id || null, memberIds: teams.A.memberIds },
      B: { name: teams.B.name, captainId: captains[1]?.id || null, memberIds: teams.B.memberIds },
    });
    setPhase("teams");
  }

  function updateRoundDuringPairing(roundId, next) {
    // Keep the user on the current round after the final pairing is confirmed
    // so the newly generated match cards can be reviewed before moving on.
    setRoundsState((current) => ({ ...current, [roundId]: next }));
  }

  function continueFromPairingRound(roundId) {
    if (roundId < 4) {
      setPairingRoundIdx(roundId + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setPhase("rounds");
    setActiveRound(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetAll() {
    const confirmed = window.confirm(
      "Reset the entire tournament? This permanently clears the saved roster, teams, pairings, results, clutch selections, and Round 5 setup."
    );
    if (!confirmed) return;

    window.localStorage.removeItem(STORAGE_KEY);
    setPhase("roster");
    setPlayers([]);
    setTeams(emptyTeams());
    setRoundsState(initRoundsState());
    setActiveRound(1);
    setPairingRoundIdx(1);
    setSaveStatus("Resetting shared tournament…");
  }

  const allStandardRoundsReadyForDreambreaker = [1, 2, 3, 4].every((roundId) => {
    const rs = roundsState[roundId];
    const allResultsEntered = rs.matches.length > 0 && rs.matches.every((m) => m.result);
    const bothClutchMatchesSelected = rs.matches.some((m) => m.clutchA) && rs.matches.some((m) => m.clutchB);
    return allResultsEntered && bothClutchMatchesSelected;
  });

  const standardRoundProgress = [1, 2, 3, 4].reduce((progress, roundId) => {
    const rs = roundsState[roundId];
    progress.totalMatches += rs.matches.length;
    progress.completedMatches += rs.matches.filter((m) => m.result).length;
    progress.clutchSelections += Number(rs.matches.some((m) => m.clutchA));
    progress.clutchSelections += Number(rs.matches.some((m) => m.clutchB));
    return progress;
  }, { totalMatches: 0, completedMatches: 0, clutchSelections: 0 });

  const allRoundsDone = ROUND_META.every((r) => {
    const rs = roundsState[r.id];
    return rs.matches.length > 0 && rs.matches.every((m) => m.result);
  });

  if (!cloudReady) {
    return (
      <div
        style={{ fontFamily: BODY_FONT, backgroundColor: "#080B0F", minHeight: "100vh" }}
        className="flex items-center justify-center px-6"
      >
        <div className="text-center">
          <p
            style={{ fontFamily: DISPLAY_FONT }}
            className="text-3xl font-black tracking-[0.08em] text-white"
          >
            THE YUKO <span className="text-[#F5A416]">CUP</span>
          </p>
          <p className="mt-3 text-sm text-white/45">Loading shared tournament…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: BODY_FONT, backgroundColor: "#080B0F", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=Inter:wght@400;500;600&display=swap');
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #080B0F; }
        button, input, select { font: inherit; }
        button { letter-spacing: .025em; }
        input, select { color: #F4F7FA; background-color: #0D1117; }
        input::placeholder { color: rgba(244,247,250,.32); }
        select option { background: #11161D; color: #F4F7FA; }
        .sports-panel { background: linear-gradient(145deg, #141920, #0F141A); border: 1px solid rgba(255,255,255,.09); }
        .sports-glow { box-shadow: 0 0 0 1px rgba(245,164,22,.35), 0 18px 50px rgba(0,0,0,.28); }
        @keyframes livePulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
        .live-pulse { animation: livePulse 1.6s ease-in-out infinite; }
      `}</style>

      <header className="border-b border-white/10 bg-[#090D12]">
        <div className="max-w-6xl mx-auto px-4 h-[58px] flex items-center justify-between">
          <div className="flex items-baseline gap-2" style={{ fontFamily: DISPLAY_FONT }}>
            <span className="text-white text-xl font-extrabold tracking-[0.12em]">THE YUKO</span>
            <span className="text-[#F5A416] text-xl font-extrabold tracking-[0.12em]">CUP</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded border border-[#F5A416]/45 text-[#F5A416]">Kitchen Cabinet</span>
        </div>
      </header>

      {(phase === "rounds" || phase === "pairing") && <Scoreboard teams={teams} roundsState={roundsState} />}

      <div className="px-4 py-8 sm:py-10">
        {phase === "roster" && (
          <div>
            <div className="text-center mb-8">
              <p className="text-xs tracking-[0.2em] uppercase text-[#F4F7FA]/40 mb-1">Two teams. Five rounds. One cup.</p>
              <h1 style={{ fontFamily: DISPLAY_FONT }} className="text-5xl sm:text-6xl font-black tracking-[0.05em] text-[#F4F7FA]">THE YUKO <span className="text-[#F5A416]">CUP</span></h1>
            </div>
            <RosterSetup players={players} setPlayers={setPlayers} onContinue={goToTeams} />
          </div>
        )}

        {phase === "teams" && (
          <TeamSetup players={players} teams={teams} setTeams={setTeams} onBack={() => setPhase("roster")} onContinue={() => setPhase("pairing")} />
        )}

        {phase === "pairing" && (
          <div className="max-w-4xl mx-auto">
            <button onClick={() => setPhase("teams")} className="text-sm text-[#F4F7FA]/60 underline mb-4 inline-block">← Back to team setup</button>

            <div className="mb-5">
              <span className="inline-block text-[10px] uppercase tracking-[0.15em] px-2 py-1 rounded-full mb-2" style={{ backgroundColor: BALL, color: INK }}>Setup — pairings for Rounds 1–4</span>
              <p className="text-xs text-[#F4F7FA]/50">All four standard rounds are paired up front. Round 5 Dreambreaker setup appears in the Match Play screen after Round 4 is locked.</p>
            </div>

            <RoundTabs
              activeRound={pairingRoundIdx}
              setActiveRound={setPairingRoundIdx}
              roundsState={roundsState}
              allowedRoundIds={[1, 2, 3, 4]}
            />

            {(() => {
              const meta = ROUND_META.find((r) => r.id === pairingRoundIdx);
              const rs = roundsState[pairingRoundIdx];
              return (
                <div>
                  <h2 style={{ fontFamily: DISPLAY_FONT }} className="text-xl tracking-wide text-[#F4F7FA] mb-1">{meta.label} pairings — {meta.subtitle}</h2>
                  <p className="text-xs text-[#F4F7FA]/50 mb-4">
                    {teams[meta.discloser].name} discloses pairings first, {teams[meta.discloser === "A" ? "B" : "A"].name} pairs against them.
                  </p>
                  <RoundPanel meta={meta} roundState={rs} teams={teams} players={players}
                    updateRound={(next) => updateRoundDuringPairing(pairingRoundIdx, next)} />

                  {rs.stage === "play" && rs.matches.length > 0 && (
                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={() => continueFromPairingRound(pairingRoundIdx)}
                        className="px-5 py-2.5 rounded-lg text-white font-medium flex items-center gap-1.5 shadow-sm hover:opacity-90 transition"
                        style={{ backgroundColor: COURT }}
                      >
                        {pairingRoundIdx < 4 ? `Continue to Round ${pairingRoundIdx + 1}` : "Start match play"}
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {phase === "rounds" && (
          <div className="max-w-4xl mx-auto">
            <button onClick={() => setPhase("pairing")} className="text-sm text-[#F4F7FA]/60 underline mb-4 inline-block">← Back to pairing setup</button>
            <RoundTabs
              activeRound={activeRound}
              setActiveRound={setActiveRound}
              roundsState={roundsState}
              allowedRoundIds={allStandardRoundsReadyForDreambreaker ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]}
            />

            {allRoundsDone && (
              <div className="mb-6 text-center py-6 rounded-xl text-white" style={{ backgroundColor: COURT }}>
                <Trophy className="mx-auto mb-2" style={{ color: BALL }} />
                <p style={{ fontFamily: DISPLAY_FONT }} className="text-2xl tracking-wide">
                  {(() => {
                    let a = 0, b = 0;
                    Object.values(roundsState).forEach((round) =>
                      round.matches.forEach((match) => {
                        const points = calculateMatchPoints(match, match.result);
                        a += points.pointsA;
                        b += points.pointsB;
                      })
                    );
                    if (a === b) return "IT'S A TIE";
                    return a > b ? `${teams.A.name.toUpperCase()} WINS THE CUP` : `${teams.B.name.toUpperCase()} WINS THE CUP`;
                  })()}
                </p>
              </div>
            )}

            {ROUND_META.filter((r) => r.id === activeRound).map((meta) => {
              const rs = roundsState[meta.id];
              const isSetupStage = rs.stage === "assign";
              return (
                <div key={meta.id}>
                  {isSetupStage ? (
                    <div className="mb-4">
                      <span className="inline-block text-[10px] uppercase tracking-[0.15em] px-2 py-1 rounded-full mb-2" style={{ backgroundColor: BALL, color: INK }}>Setup — not yet a match</span>
                      <h2 style={{ fontFamily: DISPLAY_FONT }} className="text-xl tracking-wide text-[#F4F7FA]">{meta.label} — {meta.subtitle}</h2>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <h2 style={{ fontFamily: DISPLAY_FONT }} className="text-xl tracking-wide text-[#F4F7FA]">{meta.label} — {meta.subtitle}</h2>
                      <p className="text-xs text-[#F4F7FA]/50 mt-1">Enter results as matches finish.</p>
                    </div>
                  )}
                  <RoundPanel meta={meta} roundState={rs} teams={teams} players={players}
                    updateRound={(next) => setRoundsState({ ...roundsState, [meta.id]: next })} />

                  {meta.id === 4 && (
                    <div className="mt-6 rounded-2xl border border-white/10 bg-[#0D1218] p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Round 5 access</p>
                          <p className="text-sm text-white mt-1">
                            {allStandardRoundsReadyForDreambreaker
                              ? "All standard-match results and clutch selections are complete."
                              : "Complete every result and both teams’ clutch selections in Rounds 1–4 to unlock the Dreambreaker."}
                          </p>
                          {!allStandardRoundsReadyForDreambreaker && (
                            <p className="text-xs text-white/45 mt-2">
                              Match results: {standardRoundProgress.completedMatches}/{standardRoundProgress.totalMatches} · Clutch selections: {standardRoundProgress.clutchSelections}/8
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!allStandardRoundsReadyForDreambreaker}
                          onClick={() => {
                            if (!allStandardRoundsReadyForDreambreaker) return;
                            setActiveRound(5);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="px-5 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition disabled:cursor-not-allowed disabled:opacity-45 shrink-0"
                          style={{
                            backgroundColor: allStandardRoundsReadyForDreambreaker ? COURT : "#242A31",
                            color: allStandardRoundsReadyForDreambreaker ? "white" : "rgba(255,255,255,.55)",
                          }}
                        >
                          {!allStandardRoundsReadyForDreambreaker && <Lock size={15} />}
                          {allStandardRoundsReadyForDreambreaker ? "Open Round 5 Dreambreaker" : "Round 5 locked"}
                          {allStandardRoundsReadyForDreambreaker && <ChevronRight size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-center pb-8 space-y-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-[#F4F7FA]/35">{saveStatus}</p>
        <button onClick={resetAll} className="text-xs inline-flex items-center gap-1 text-[#F4F7FA]/40 hover:text-[#FF6464]">
          <RotateCcw size={12} /> Reset tournament
        </button>
      </div>
    </div>
  );
}
