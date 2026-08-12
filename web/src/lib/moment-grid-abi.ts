/// The slice of MomentGrid the browser touches.
///
/// One shared definition rather than an inline copy per component: the submit
/// button and the withdraw button both need `roundDetails`, and two drifting
/// copies of a payable function's signature is a bug that only shows up when a
/// transaction reverts in front of an audience.
export const momentGridAbi = [
  {
    type: "function",
    name: "roundDetails",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "startMinute", type: "uint64" },
          { name: "entryFee", type: "uint128" },
          { name: "state", type: "uint8" },
          { name: "entrantCount", type: "uint32" },
          { name: "winnerCount", type: "uint32" },
          { name: "highScore", type: "uint8" },
          { name: "pot", type: "uint256" },
          { name: "tierPools", type: "uint256[3]" },
          { name: "eventsByWindow", type: "uint256[3]" },
        ],
      },
    ],
  },
  /// Payable, but `msg.value` covers only the grid store's fee — the entry fee
  /// is pulled in the entry token, which the player must approve first.
  {
    type: "function",
    name: "submitGrid",
    stateMutability: "payable",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "encodedGrid", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimable",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdrawWinnings",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "entryToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "hasEntered",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "fragments",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "purchaseMegapotTicket",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export const gridStoreAbi = [
  {
    type: "function",
    name: "submissionFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
