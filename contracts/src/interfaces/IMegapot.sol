// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface IMegapot {
    function purchaseTickets(address referrer, uint256 value, address recipient) external returns (bool);
}
