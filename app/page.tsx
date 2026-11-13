"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { child, get, push, ref, set } from "firebase/database";
import { db } from "./firebase";

const PIN_LENGTH = 6;
const MAX_PIN_ATTEMPTS = 5;

function generatePin() {
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(PIN_LENGTH, "0");
}

export default function Home() {
  const router = useRouter();

  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [pinFocused, setPinFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pinRef = useRef<HTMLInputElement>(null);
  const pinId = useId();
  const nameId = useId();

  const canJoin = pin.length === PIN_LENGTH && name.trim().length > 0;

  function updatePin(value: string) {
    setPin(value.replace(/\D/g, "").slice(0, PIN_LENGTH));
  }

  async function handleCreateRoom() {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      // Find a free PIN so we never overwrite someone else's room
      let newPin = "";
      for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt++) {
        const candidate = generatePin();
        const existing = await get(ref(db, `rooms/${candidate}`));
        if (!existing.exists()) {
          newPin = candidate;
          break;
        }
      }

      if (!newPin) {
        setError("Не вдалося згенерувати вільний PIN-код. Спробуйте ще раз.");
        return;
      }

      // Room structure with timer and active speaker
      await set(ref(db, `rooms/${newPin}`), {
        createdAt: Date.now(),
        status: "lobby",
        participants: {},
        timer: { isRunning: false, endTime: 0 },
        activeSpeaker: "",
      });

      // Facilitator rights live only in this tab's sessionStorage
      localStorage.removeItem(`facilitator_${newPin}`); // clean legacy key
      sessionStorage.removeItem(`participant_${newPin}`); // facilitator is not a participant
      sessionStorage.setItem(`facilitator_${newPin}`, "true");

      setPin(newPin);
      router.push(`/room/${newPin}`);
    } catch {
      setError("Не вдалося створити кімнату. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canJoin || loading) return;

    setLoading(true);
    setError("");

    try {
      const roomSnapshot = await get(child(ref(db), `rooms/${pin}`));

      if (!roomSnapshot.exists()) {
        setError("Кімнати з таким PIN-кодом не існує.");
        return;
      }

      // A regular participant never has facilitator privileges
      sessionStorage.removeItem(`facilitator_${pin}`);
      localStorage.removeItem(`facilitator_${pin}`);

      const roles = ["pro", "jury", "con"];
      const randomRole = roles[Math.floor(Math.random() * roles.length)];

      // push() guarantees a unique ID even if two people join simultaneously
      const participantRef = push(ref(db, `rooms/${pin}/participants`));
      await set(participantRef, {
        name: name.trim(),
        role: randomRole,
      });

      // Remember which participant this tab is (needed for the jury panel)
      if (participantRef.key) {
        sessionStorage.setItem(`participant_${pin}`, participantRef.key);
      }

      router.push(`/room/${pin}`);
    } catch {
      setError("Не вдалося приєднатися. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#09090b] px-4 py-12 text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_55%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_6px_rgba(255,255,255,0.02)]">
            <span className="text-lg font-semibold tracking-tight text-indigo-300">D</span>
          </div>
          <p className="text-sm font-medium tracking-[0.18em] text-zinc-500 uppercase">Debate Room</p>
          <h1 className="mt-2 text-[1.75rem] leading-tight font-semibold tracking-tight text-white">Дебатна кімната</h1>
        </div>

        <section className="rounded-3xl border border-white/10 bg-[#141416]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
          <form onSubmit={handleJoin} className="space-y-5">
            <div>
              <p className="text-[13px] font-medium text-zinc-400">Для учасників</p>
              <label htmlFor={pinId} className="mt-4 block text-sm font-medium text-zinc-200">PIN-код кімнати</label>
              <button type="button" onClick={() => pinRef.current?.focus()} className="mt-2 grid w-full grid-cols-6 gap-2">
                {Array.from({ length: PIN_LENGTH }, (_, index) => {
                  const active = pinFocused && pin.length === index;
                  const filled = Boolean(pin[index]);
                  return (
                    <span key={index} className={`flex h-14 items-center justify-center rounded-xl border text-[1.65rem] font-semibold tabular-nums transition ${active ? "border-indigo-400 bg-indigo-500/10 text-white shadow-[0_0_0_3px_rgba(99,102,241,0.18)]" : filled ? "border-white/15 bg-white/[0.06] text-white" : "border-white/10 bg-black/30 text-zinc-600"}`}>
                      {pin[index] ?? "–"}
                    </span>
                  );
                })}
              </button>
              <input ref={pinRef} id={pinId} value={pin} inputMode="numeric" autoComplete="one-time-code" maxLength={PIN_LENGTH} aria-label="PIN-код кімнати" onChange={(event) => updatePin(event.target.value)} onFocus={() => setPinFocused(true)} onBlur={() => setPinFocused(false)} className="sr-only" />
            </div>

            <div>
              <label htmlFor={nameId} className="block text-sm font-medium text-zinc-200">Імʼя</label>
              <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} placeholder="Як тебе бачитимуть у кімнаті" autoComplete="nickname" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-indigo-400 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.18)]" />
            </div>

            <button type="submit" disabled={!canJoin || loading} className="mt-2 h-14 w-full rounded-xl bg-white text-base font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-zinc-500">
              {loading ? "Підключення..." : "Приєднатися"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-sm text-zinc-500">або</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div>
            <p className="mb-3 text-[13px] font-medium text-zinc-400">Для фасилітатора</p>
            <button type="button" onClick={handleCreateRoom} disabled={loading} className="h-14 w-full rounded-xl border border-white/10 bg-white/[0.04] text-base font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "Створення..." : "Створити нову кімнату"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}