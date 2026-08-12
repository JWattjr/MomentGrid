// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {MockERC20} from "./MockERC20.sol";

/// @notice Stand-in for the Megapot lottery. Pulls the ticket price from the
///         buyer's allowance exactly as the real contract does, so a missing or
///         insufficient approval fails here the same way it would on chain.
contract MockMegapot {
    MockERC20 private immutable _token;

    mapping(address recipient => uint256 count) public ticketsOf;
    address public lastReferrer;

    constructor(MockERC20 token) {
        _token = token;
    }

    function purchaseTickets(address referrer, uint256 value, address recipient) external returns (bool) {
        _token.transferFrom(msg.sender, address(this), value);
        ticketsOf[recipient] += 1;
        lastReferrer = referrer;
        return true;
    }
}
