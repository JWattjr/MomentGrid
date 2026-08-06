// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library LineScoring {
    uint16 internal constant ROW_0 = 0x007;
    uint16 internal constant ROW_1 = 0x038;
    uint16 internal constant ROW_2 = 0x1c0;
    uint16 internal constant COLUMN_0 = 0x049;
    uint16 internal constant COLUMN_1 = 0x092;
    uint16 internal constant COLUMN_2 = 0x124;
    uint16 internal constant DIAGONAL_DOWN = 0x111;
    uint16 internal constant DIAGONAL_UP = 0x054;

    function count(uint16 markedMask) internal pure returns (uint8 lines) {
        if (markedMask & ROW_0 == ROW_0) ++lines;
        if (markedMask & ROW_1 == ROW_1) ++lines;
        if (markedMask & ROW_2 == ROW_2) ++lines;
        if (markedMask & COLUMN_0 == COLUMN_0) ++lines;
        if (markedMask & COLUMN_1 == COLUMN_1) ++lines;
        if (markedMask & COLUMN_2 == COLUMN_2) ++lines;
        if (markedMask & DIAGONAL_DOWN == DIAGONAL_DOWN) ++lines;
        if (markedMask & DIAGONAL_UP == DIAGONAL_UP) ++lines;
    }
}

