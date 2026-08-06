import type { Metadata } from "next";
import { GameShell } from "@/components/game-shell";

export const metadata: Metadata = {
  title: "Moment Grid — Tournament poster study",
  description: "The archived tournament-poster visual direction for Moment Grid.",
};

export default function PosterStudyPage() {
  return <GameShell visualTheme="poster" />;
}
