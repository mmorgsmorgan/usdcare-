// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {USDCareTreatmentEscrowV2} from "../src/USDCareTreatmentEscrowV2.sol";

contract V2MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
}

contract USDCareTreatmentEscrowV2Test is Test {
    V2MockUSDC token;
    USDCareTreatmentEscrowV2 escrow;
    address admin = makeAddr("admin");
    address provider = makeAddr("hospital");
    address payerOne = makeAddr("payer-one");
    address payerTwo = makeAddr("payer-two");

    function setUp() public {
        token = new V2MockUSDC();
        escrow = new USDCareTreatmentEscrowV2(token, admin);
        token.mint(payerOne, 10e6); token.mint(payerTwo, 10e6);
        vm.prank(payerOne); token.approve(address(escrow), type(uint256).max);
        vm.prank(payerTwo); token.approve(address(escrow), type(uint256).max);
    }

    function createPlan(uint16 threshold) internal returns (uint256 id) {
        address[] memory payers = new address[](2); payers[0] = payerOne; payers[1] = payerTwo;
        uint128[] memory amounts = new uint128[](3); amounts[0] = 1e6; amounts[1] = 1e6; amounts[2] = 3e6;
        vm.prank(provider); id = escrow.createEscrow(provider, payers, false, threshold, amounts);
    }

    function testProviderCreatesAndTwoPayersFundPlan() public {
        uint256 id = createPlan(1);
        vm.prank(payerOne); escrow.fundEscrow(id, 2e6);
        vm.prank(payerTwo); escrow.fundEscrow(id, 3e6);
        (address creator, address settlement, uint128 total, uint128 funded, uint128 released, uint32 nextMilestone, uint32 milestoneCount, uint16 payerCount, uint16 approvals, bool openFunding, USDCareTreatmentEscrowV2.Status status) = escrow.escrows(id);
        assertEq(creator, provider); assertEq(settlement, provider); assertEq(total, 5e6); assertEq(released, 0); assertEq(nextMilestone, 0); assertEq(milestoneCount, 3); assertEq(payerCount, 2); assertEq(approvals, 1); assertFalse(openFunding);
        assertEq(funded, 5e6); assertEq(uint8(status), uint8(USDCareTreatmentEscrowV2.Status.FUNDED));
    }

    function testUnlistedWalletCannotFund() public {
        uint256 id = createPlan(1);
        address stranger = makeAddr("stranger"); token.mint(stranger, 5e6);
        vm.prank(stranger); token.approve(address(escrow), 5e6);
        vm.expectRevert("not authorized payer"); vm.prank(stranger); escrow.fundEscrow(id, 1e6);
    }

    function testOpenRequestCanBeFundedByWalletChosenAfterCreation() public {
        address[] memory noAssignedPayers = new address[](0);
        uint128[] memory amounts = new uint128[](1); amounts[0] = 5e6;
        vm.prank(provider); uint256 id = escrow.createEscrow(provider, noAssignedPayers, true, 0, amounts);
        address sponsor = makeAddr("later-sponsor"); token.mint(sponsor, 5e6);
        vm.prank(sponsor); token.approve(address(escrow), 5e6);
        vm.prank(sponsor); escrow.fundEscrow(id, 5e6);
        assertEq(escrow.payerContributions(id, sponsor), 5e6);
    }

    function testEvidenceAndPayerApprovalUnlockMilestone() public {
        uint256 id = createPlan(1);
        vm.prank(payerOne); escrow.fundEscrow(id, 5e6);
        vm.expectRevert("evidence required"); escrow.releaseMilestone(id);
        bytes32 proof = keccak256("offchain-proof-reference");
        vm.prank(provider); escrow.submitMilestoneEvidence(id, 0, proof);
        vm.expectRevert("payer approval required"); escrow.releaseMilestone(id);
        vm.prank(payerOne); escrow.approveMilestone(id, 0);
        escrow.releaseMilestone(id);
        assertEq(token.balanceOf(provider), 1e6);
    }

    function testApprovalThresholdCanRequireBothFundingPayers() public {
        uint256 id = createPlan(2);
        vm.prank(payerOne); escrow.fundEscrow(id, 2e6);
        vm.prank(payerTwo); escrow.fundEscrow(id, 3e6);
        vm.prank(provider); escrow.submitMilestoneEvidence(id, 0, keccak256("proof"));
        vm.prank(payerOne); escrow.approveMilestone(id, 0);
        vm.expectRevert("payer approval required"); escrow.releaseMilestone(id);
        vm.prank(payerTwo); escrow.approveMilestone(id, 0);
        escrow.releaseMilestone(id);
    }
}
