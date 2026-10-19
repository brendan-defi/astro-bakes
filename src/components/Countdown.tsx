"use client";

import { useEffect, useState } from "react";
import { daysHoursUntil } from "@/lib/format";
import s from "./home.module.css";

/** Days + hours until the drop opens; recalculated on load and every minute (PRD 1.1: no seconds). */
export function Countdown({ openAt, initial, labels }: { openAt: number; initial: { days: number; hours: number }; labels: { days: string; hours: string } }) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const tick = () => setV(daysHoursUntil(new Date(openAt)));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [openAt]);
  return (
    <div className={s.tiles} role="timer">
      <div className={`${s.tile} ${s.tileL}`}>
        <div className={s.tileNum}>{v.days}</div>
        <div className={s.tileLabel}>{labels.days}</div>
      </div>
      <div className={`${s.tile} ${s.tileR}`}>
        <div className={s.tileNum}>{v.hours}</div>
        <div className={s.tileLabel}>{labels.hours}</div>
      </div>
    </div>
  );
}
