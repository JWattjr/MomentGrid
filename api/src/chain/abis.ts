export const gridStoreAbi = [
  { type: "error", name: "Unauthorized", inputs: [] },
  { type: "error", name: "InvalidController", inputs: [] },
  { type: "error", name: "ControllerAlreadySet", inputs: [] },
  {
    type: "error",
    name: "IncorrectIncoFee",
    inputs: [
      { name: "expected", type: "uint256" },
      { name: "supplied", type: "uint256" },
    ],
  },
  { type: "error", name: "GridAlreadyStored", inputs: [] },
  { type: "error", name: "GridNotFound", inputs: [] },
  { type: "error", name: "ScoreAlreadyPrepared", inputs: [] },
  { type: "error", name: "ScoreNotPrepared", inputs: [] },
  { type: "error", name: "ScoreNotResolved", inputs: [] },
  { type: "error", name: "ResultWindowsMismatch", inputs: [] },
  { type: "error", name: "InvalidDecryptionAttestation", inputs: [] },
  {
    type: "function",
    name: "submissionFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "prepareScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
      { name: "eventsByWindow", type: "uint256[3]" },
    ],
    outputs: [{ name: "handle", type: "bytes32" }],
  },
  {
    type: "function",
    name: "encryptedScoreHandle",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "resolvedScore",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "markedMask", type: "uint16" },
          { name: "completedLines", type: "uint8" },
          { name: "validGrid", type: "bool" },
          { name: "ready", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "submitScoreDecryption",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
      {
        name: "decryption",
        type: "tuple",
        components: [
          { name: "handle", type: "bytes32" },
          { name: "value", type: "bytes32" },
        ],
      },
      { name: "signatures", type: "bytes[]" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "EncryptedGridStored",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "handle", type: "bytes32", indexed: true },
    ],
  },
] as const;

export const momentGridAbi = [
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
    name: "settleRound",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "eventsByWindow", type: "uint256[3]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "lockRound",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "entrants",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
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
  {
    type: "function",
    name: "fragments",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "megapotTicketsPurchased",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "RoundCreated",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "startMinute", type: "uint64", indexed: false },
      { name: "entryFee", type: "uint128", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoundLocked",
    inputs: [{ name: "roundId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "GridSubmitted",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "PlayerScored",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "markedMask", type: "uint16", indexed: false },
      { name: "completedLines", type: "uint8", indexed: false },
      { name: "eligible", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoundSettled",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "highScore", type: "uint8", indexed: false },
      { name: "winnerCount", type: "uint32", indexed: false },
      { name: "pot", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MegapotTicketPurchased",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "ticketNumber", type: "uint256", indexed: false },
      { name: "price", type: "uint256", indexed: false },
    ],
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
    name: "claimable",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "payout",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "completedLines",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "eligible",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  /// One call for the whole reward screen, so the indexer-lag fallback costs a
  /// single RPC round-trip rather than four.
  {
    type: "function",
    name: "roundOutcomeOf",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [
      { name: "lines", type: "uint8" },
      { name: "isEligible", type: "bool" },
      { name: "amount", type: "uint256" },
      { name: "claimableTotal", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "withdrawWinnings",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  /// Emitted once per player owed anything by a settlement, whether they won a
  /// share or the round voided and their stake came back. `PlayerScored` fires
  /// before payouts are computed, so it cannot carry the amount.
  {
    type: "event",
    name: "WinningsAccrued",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "refund", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WinningsWithdrawn",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "roundCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "createRound",
    stateMutability: "nonpayable",
    inputs: [
      { name: "startMinute", type: "uint64" },
      { name: "entryFee", type: "uint128" },
      { name: "tierPools", type: "uint256[3]" },
    ],
    outputs: [{ name: "roundId", type: "uint256" }],
  },
] as const;

/// The slice of ERC20 the API reads. Balances and decimals only — the API never
/// moves entry tokens; players approve and withdraw for themselves.
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
