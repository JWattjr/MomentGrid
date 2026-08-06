// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface IMegapot {
    function purchaseTickets(address referrer, uint256 value, address recipient) external returns (bool);
}

interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
