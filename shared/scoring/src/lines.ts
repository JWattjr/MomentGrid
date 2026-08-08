/// The eight scoring lines of a 3x3 grid as cell bitmasks, in the exact order
/// used by `LineScoring.sol` and `IncoGridStore._countLines`. Rows first, then
/// columns, then the two diagonals. Any change here must be mirrored in both
/// Solidity implementations and is guarded by the parity vectors.
export const LINE_MASKS = [0x007, 0x038, 0x1c0, 0x049, 0x092, 0x124, 0x111, 0x054] as const;

export function completedLineIndexes(mask: number): number[] {
  return LINE_MASKS.flatMap((lineMask, index) => ((mask & lineMask) === lineMask ? [index] : []));
}

export function completedLinesForMask(mask: number): number {
  return completedLineIndexes(mask).length;
}
