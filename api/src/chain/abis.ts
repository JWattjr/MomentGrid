export const gridStoreAbi = [
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
] as const;
