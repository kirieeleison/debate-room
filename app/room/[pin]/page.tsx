"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { db } from "../../firebase";
import { ref, onValue, update } from "firebase/database";

type Team = "pro" | "con";

type Participant = {
  id: string;
  name: string;
  role: string;
  scores: Record<string, number>; // jury member ID -> score 1..10
};

type TimerData = {
  isRunning: boolean;
  endTime: number;
};

type RawParticipant = {
  name: string;
  role: string;
  scores?: Record<string, unknown>;
};

type RoomData = {
  participants?: Record<string, RawParticipant>;
  activeSpeaker?: string;
  timer?: TimerData;
};

const SCORE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const TEAM_STYLES: Record<
  Team,
  { label: string; text: string; bar: string; chip: string }
> = {
  pro: {
    label: "Pro (За)",
    text: "text-emerald-400",
    bar: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]",
    chip: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  },
  con: {
    label: "Con (Проти)",
    text: "text-rose-400",
    bar: "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.5)]",
    chip: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  },
};

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function speakerStats(p: Participant) {
  const values = Object.values(p.scores);
  return { avg: average(values), count: values.length };
}

function teamStats(speakers: Participant[]) {
  const rated = speakers
    .map((s) => speakerStats(s).avg)
    .filter((v): v is number => v !== null);
  return { avg: average(rated), rated: rated.length, total: speakers.length };
}

function TeamStat({ team, speakers }: { team: Team; speakers: Participant[] }) {
  const style = TEAM_STYLES[team];
  const { avg, rated, total } = teamStats(speakers);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-semibold uppercase tracking-widest ${style.text}`}>{style.label}</span>
        <span className="text-xs text-zinc-500">Оцінено спікерів: {rated} / {total}</span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-mono text-4xl font-bold tabular-nums text-white">
          {avg === null ? "–" : avg.toFixed(1)}
        </span>
        <span className="mb-1 text-sm text-zinc-600">/ 10</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
          style={{ width: `${avg === null ? 0 : avg * 10}%` }}
        />
      </div>
    </div>
  );
}

function ScoreBoard({ proList, conList }: { proList: Participant[]; conList: Participant[] }) {
  const proAvg = teamStats(proList).avg;
  const conAvg = teamStats(conList).avg;

  let leader: string | null = null;
  if (proAvg !== null && conAvg !== null) {
    if (proAvg > conAvg) leader = "Лідирує: Pro (За)";
    else if (conAvg > proAvg) leader = "Лідирує: Con (Проти)";
    else leader = "Рахунок рівний";
  }

  return (
    <section className="mb-6 rounded-3xl border border-white/10 bg-[#141416]/90 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-amber-400">
          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"></span>
          Бали команд
        </h3>
        {leader ? (
          <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            {leader}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">Очікування оцінок журі...</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TeamStat team="pro" speakers={proList} />
        <TeamStat team="con" speakers={conList} />
      </div>
    </section>
  );
}

function SpeakerScores({
  participant,
  team,
  juryNames,
}: {
  participant: Participant;
  team: Team;
  juryNames: Record<string, string>;
}) {
  const style = TEAM_STYLES[team];
  const { avg, count } = speakerStats(participant);
  const entries = Object.entries(participant.scores);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Бали спікера</span>
        {avg === null ? (
          <span className="text-xs text-zinc-600">ще не оцінено</span>
        ) : (
          <span className="font-mono text-sm font-semibold tabular-nums text-white">
            {avg.toFixed(1)} <span className="text-xs font-normal text-zinc-500">/ 10 · {count}</span>
          </span>
        )}
      </div>
      {entries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entries.map(([juryId, value]) => (
            <span key={juryId} className={`rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${style.chip}`}>
              {juryNames[juryId] ?? "Суддя"} {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScorePicker({
  speakerName,
  myScore,
  onRate,
}: {
  speakerName: string;
  myScore: number | undefined;
  onRate: (value: number) => void;
}) {
  return (
    <div
      className="mt-3 border-t border-white/10 pt-3"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300">Ваша оцінка</span>
        <span className="font-mono text-xs tabular-nums text-zinc-500">
          {isScore(myScore) ? `${myScore} / 10` : "не оцінено"}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {SCORE_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onRate(value)}
            aria-label={`${speakerName}: ${value} з 10`}
            aria-pressed={myScore === value}
            className={`h-8 rounded-lg border text-sm font-semibold tabular-nums transition ${
              myScore === value
                ? "border-indigo-400 bg-indigo-400 text-zinc-950 shadow-[0_0_12px_rgba(99,102,241,0.45)]"
                : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-zinc-600">Натисніть на вибрану оцінку ще раз, щоб зняти її.</p>
    </div>
  );
}

function RoleColumn({
  title,
  textColor,
  dotColor,
  shadowColor,
  participants,
  emptyText,
  activeSpeaker,
  isFacilitator,
  onParticipantClick,
  currentUserId,
  canRate,
  juryNames,
  onRate,
}: {
  title: string;
  textColor: string;
  dotColor: string;
  shadowColor: string;
  participants: Participant[];
  emptyText: string;
  activeSpeaker: string;
  isFacilitator: boolean;
  onParticipantClick: (id: string) => void;
  currentUserId: string;
  canRate: boolean;
  juryNames: Record<string, string>;
  onRate: (speakerId: string, value: number) => void;
}) {
  return (
    <div className="flex flex-col rounded-3xl border border-white/5 bg-[#141416]/60 p-6 backdrop-blur-sm">
      <h3 className={`mb-6 flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-widest ${textColor}`}>
        <span className={`h-2 w-2 rounded-full ${dotColor} ${shadowColor}`}></span>
        {title}
      </h3>
      <div className="flex flex-1 flex-col gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4">
        {participants.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm font-medium text-zinc-600">{emptyText}</p>
          </div>
        ) : (
          participants.map((p) => {
            const isActive = activeSpeaker === p.id;
            const isSpeaker = p.role === "pro" || p.role === "con";
            const isOwnJuryCard = p.role === "jury" && p.id === currentUserId;

            return (
              <div
                key={p.id}
                onClick={isFacilitator ? () => onParticipantClick(p.id) : undefined}
                className={`rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? "border-2 border-indigo-400 bg-indigo-500/20 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                    : "border border-white/10 bg-white/5 text-zinc-300"
                } ${isFacilitator ? "cursor-pointer hover:border-indigo-400/50" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {p.name}
                    {p.id === currentUserId && (
                      <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        ви
                      </span>
                    )}
                  </span>
                  {isActive && <span className="animate-pulse text-xs text-indigo-300">🎙️ Говорить</span>}
                </div>

                {/* Scores of this speaker: visible to everyone */}
                {isSpeaker && (
                  <SpeakerScores participant={p} team={p.role as Team} juryNames={juryNames} />
                )}

                {/* Evaluation input: only for jury members, only on speaker cards */}
                {isSpeaker && canRate && (
                  <ScorePicker
                    speakerName={p.name}
                    myScore={p.scores[currentUserId]}
                    onRate={(value) => onRate(p.id, value)}
                  />
                )}

                {isOwnJuryCard && (
                  <p className="mt-3 text-xs text-zinc-500">
                    Ви в журі. Оцінюйте кожного спікера в колонках Pro та Con.
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RoomContent() {
  const params = useParams();
  const pin = params?.pin as string;

  const [isFacilitator, setIsFacilitator] = useState(false);
  const [myId, setMyId] = useState("");
  const [roomExists, setRoomExists] = useState<boolean | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState("");
  const [timerData, setTimerData] = useState<TimerData>({ isRunning: false, endTime: 0 });
  const [timeLeft, setTimeLeft] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);

  // Identity of this tab: facilitator flag and participant ID come only from sessionStorage
  useEffect(() => {
    if (!pin) return;
    setIsFacilitator(sessionStorage.getItem(`facilitator_${pin}`) === "true");
    setMyId(sessionStorage.getItem(`participant_${pin}`) ?? "");
  }, [pin]);

  // Offset between local clock and Firebase server clock (for a synchronized timer)
  useEffect(() => {
    const offsetRef = ref(db, ".info/serverTimeOffset");
    const unsubscribe = onValue(offsetRef, (snap) => {
      setServerOffset(typeof snap.val() === "number" ? snap.val() : 0);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to the room
  useEffect(() => {
    if (!pin) return;
    const roomRef = ref(db, `rooms/${pin}`);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        setRoomExists(false);
        return;
      }

      setRoomExists(true);
      const data = snapshot.val() as RoomData;

      if (data.participants) {
        const parsed: Participant[] = Object.entries(data.participants).map(([id, p]) => {
          const scores: Record<string, number> = {};
          Object.entries(p.scores ?? {}).forEach(([juryId, value]) => {
            if (isScore(value)) scores[juryId] = value;
          });
          return { id, name: p.name, role: p.role, scores };
        });
        setParticipants(parsed);
      } else {
        setParticipants([]);
      }

      setActiveSpeaker(data.activeSpeaker || "");
      if (data.timer) setTimerData(data.timer);
    });

    return () => unsubscribe();
  }, [pin]);

  // Countdown logic (based on server time)
  useEffect(() => {
    if (!timerData.isRunning) {
      setTimeLeft(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, timerData.endTime - (Date.now() + serverOffset));
      setTimeLeft(remaining);
      return remaining;
    };

    if (tick() <= 0) return;

    const interval = setInterval(() => {
      if (tick() <= 0) clearInterval(interval);
    }, 250);

    return () => clearInterval(interval);
  }, [timerData, serverOffset]);

  const me = participants.find((p) => p.id === myId);
  const canRate = !isFacilitator && me?.role === "jury";

  const juryNames: Record<string, string> = {};
  participants.forEach((p) => {
    if (p.role === "jury") juryNames[p.id] = p.name;
  });

  // Facilitator-only controls
  const startTimer = (minutes: number) => {
    if (!isFacilitator) return;
    const endTime = Date.now() + serverOffset + minutes * 60000;
    update(ref(db, `rooms/${pin}`), { timer: { isRunning: true, endTime } });
  };

  const stopTimer = () => {
    if (!isFacilitator) return;
    update(ref(db, `rooms/${pin}`), { timer: { isRunning: false, endTime: 0 } });
  };

  const toggleSpeaker = (participantId: string) => {
    if (!isFacilitator) return;
    const newSpeaker = activeSpeaker === participantId ? "" : participantId; // a second click removes the spotlight
    update(ref(db, `rooms/${pin}`), { activeSpeaker: newSpeaker });
  };

  // Jury-only action: a jury member writes only their own score under the speaker's node
  const rateSpeaker = (speakerId: string, value: number) => {
    if (!canRate || !myId) return;
    if (!Number.isInteger(value) || value < 1 || value > 10) return;

    const target = participants.find((p) => p.id === speakerId);
    if (!target || (target.role !== "pro" && target.role !== "con")) return;

    // Clicking the already selected score removes it
    const next = target.scores[myId] === value ? null : value;
    update(ref(db, `rooms/${pin}/participants/${speakerId}/scores`), { [myId]: next });
  };

  // mm:ss, rounded up so 00:00 isn't shown a second early
  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const proList = participants.filter((p) => p.role === "pro");
  const juryList = participants.filter((p) => p.role === "jury");
  const conList = participants.filter((p) => p.role === "con");

  if (roomExists === false) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <p className="text-lg font-medium text-zinc-300">Кімнату з PIN-кодом {pin} не знайдено.</p>
        <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-zinc-300 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white">
          Повернутися на головну
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#141416]/90 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_4px_rgba(255,255,255,0.02)]">
            <span className="text-xl font-semibold tracking-tight text-indigo-300">D</span>
          </div>
          <div className="hidden sm:block">
            <p className="text-[11px] font-medium tracking-[0.18em] text-zinc-500 uppercase">Debate Room</p>
            <h2 className="text-lg font-semibold text-white">Кімната дебатів</h2>
          </div>
        </div>

        {/* Synchronized timer */}
        <div className={`text-4xl font-mono font-bold tracking-widest drop-shadow-[0_0_12px_rgba(255,255,255,0.15)] ${timeLeft > 0 && timeLeft <= 30000 ? "text-red-400 animate-pulse" : "text-white"}`}>
          {formatTime(timeLeft)}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-2.5">
            <span className="text-[11px] font-medium tracking-wider text-indigo-300/70 uppercase">PIN</span>
            <span className="text-lg font-mono font-semibold tracking-widest text-indigo-300 tabular-nums">{pin}</span>
          </div>
          <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-zinc-300 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400">
            Вийти
          </Link>
        </div>
      </header>

      {/* Facilitator control panel: rendered only when isFacilitator === true */}
      {isFacilitator && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-4 backdrop-blur-md">
          <span className="text-sm font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            👑 Панель ведучого
          </span>
          <div className="h-4 w-px bg-white/10 hidden sm:block"></div>
          <div className="flex gap-2">
            <button onClick={() => startTimer(1)} className="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition border border-white/5">1 хв</button>
            <button onClick={() => startTimer(3)} className="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition border border-white/5">3 хв</button>
            <button onClick={() => startTimer(5)} className="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition border border-white/5">5 хв</button>
            <button onClick={stopTimer} className="rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition border border-red-500/20">Стоп</button>
          </div>
          <p className="text-xs text-zinc-500 ml-auto hidden md:block">Клікніть на учасника, щоб передати слово</p>
        </div>
      )}

      {/* Team totals computed from individual speaker scores, visible to everyone */}
      <ScoreBoard proList={proList} conList={conList} />

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
        <RoleColumn title="Pro (За)" textColor="text-emerald-400" dotColor="bg-emerald-400" shadowColor="shadow-[0_0_8px_rgba(52,211,153,0.6)]" participants={proList} emptyText="Очікування учасників..." activeSpeaker={activeSpeaker} isFacilitator={isFacilitator} onParticipantClick={toggleSpeaker} currentUserId={myId} canRate={canRate} juryNames={juryNames} onRate={rateSpeaker} />
        <RoleColumn title="Jury (Журі)" textColor="text-amber-400" dotColor="bg-amber-400" shadowColor="shadow-[0_0_8px_rgba(251,191,36,0.6)]" participants={juryList} emptyText="Очікування суддів..." activeSpeaker={activeSpeaker} isFacilitator={isFacilitator} onParticipantClick={toggleSpeaker} currentUserId={myId} canRate={canRate} juryNames={juryNames} onRate={rateSpeaker} />
        <RoleColumn title="Con (Проти)" textColor="text-rose-400" dotColor="bg-rose-400" shadowColor="shadow-[0_0_8px_rgba(251,113,133,0.6)]" participants={conList} emptyText="Очікування учасників..." activeSpeaker={activeSpeaker} isFacilitator={isFacilitator} onParticipantClick={toggleSpeaker} currentUserId={myId} canRate={canRate} juryNames={juryNames} onRate={rateSpeaker} />
      </div>
    </>
  );
}

export default function RoomPage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#09090b] px-4 py-8 text-zinc-100 sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.12),transparent_55%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="relative z-10 mx-auto w-full max-w-6xl flex-1 flex flex-col">
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-zinc-500">Завантаження кімнати...</div>}>
          <RoomContent />
        </Suspense>
      </div>
    </main>
  );
}