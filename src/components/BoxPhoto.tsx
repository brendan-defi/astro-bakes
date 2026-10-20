import Image from "next/image";
import type { ReactNode } from "react";
import type { Box } from "@/lib/data";
import { CameraIcon } from "./icons";
import s from "./home.module.css";

/** A box card's photo strip: the box's photo, or a labelled placeholder until it has one (D4). */
export function BoxPhoto({ box, placeholder, children }: { box: Box; placeholder: string; children?: ReactNode }) {
  return (
    <div className={s.boxPhoto} style={{ background: box.tint }}>
      {box.photo ? (
        <Image src={box.photo} alt={box.name} fill sizes="(min-width: 1200px) 360px, (min-width: 700px) 50vw, 100vw" />
      ) : (
        <>
          <CameraIcon />
          <span>{placeholder}</span>
        </>
      )}
      {children}
    </div>
  );
}
