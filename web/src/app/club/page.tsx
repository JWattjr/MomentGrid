import type { Metadata } from "next";
import { GameShell } from "@/components/game-shell";

export const metadata: Metadata = {
  title: "Moment Grid — Stadium-night design",
  description: "The selected builder-club visual direction for Moment Grid.",
};

export default function ClubStudyPage() {
  return <GameShell visualTheme="club" />;
}
