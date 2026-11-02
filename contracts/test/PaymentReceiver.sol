// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITestGame {
    function enterGame(uint256 score, string calldata repository, string calldata website) external payable;
    function claimPrize(uint256 entryId) external;
    function claimRefund(uint256 entryId) external;
}

/// @dev Payment failure and reentrancy fixture, never used by the application.
contract PaymentReceiver {
    ITestGame public immutable game;
    bool public rejectPayment;
    bool public attemptReentry;
    bool public reentryBlocked;
    uint256 private claiming;

    constructor(address target) { game = ITestGame(target); }
    function enter() external payable { game.enterGame{value: msg.value}(70, "https://github.com/test/repository", ""); }
    function configure(bool reject, bool attack) external { rejectPayment = reject; attemptReentry = attack; }
    function claim(uint256 entryId) external { claiming = entryId; game.claimPrize(entryId); }
    function refund(uint256 entryId) external { game.claimRefund(entryId); }
    receive() external payable {
        require(!rejectPayment, "Receiver rejected payment");
        if (attemptReentry) {
            try game.claimPrize(claiming) { reentryBlocked = false; }
            catch { reentryBlocked = true; }
        }
    }
}
