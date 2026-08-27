// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { USDCareProviderRegistry } from "../src/USDCareProviderRegistry.sol";
import { USDCarePaymentRouter } from "../src/USDCarePaymentRouter.sol";
import { USDCareTreatmentEscrow } from "../src/USDCareTreatmentEscrow.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract USDCareContractsTest is Test {
    MockUSDC token;
    USDCareProviderRegistry registry;
    USDCarePaymentRouter router;
    USDCareTreatmentEscrow escrow;
    address admin = makeAddr("admin");
    address payer = makeAddr("payer");
    address provider = makeAddr("provider");
    address patient = makeAddr("patient");

    function setUp() public {
        token = new MockUSDC();
        registry = new USDCareProviderRegistry(admin);
        router = new USDCarePaymentRouter(token, registry, admin);
        escrow = new USDCareTreatmentEscrow(token, registry, admin);
        vm.prank(admin);
        registry.setProvider(provider, true);
        token.mint(payer, 10_000e6);
        vm.prank(payer);
        token.approve(address(router), type(uint256).max);
        vm.prank(payer);
        token.approve(address(escrow), type(uint256).max);
    }

    function testDirectPaymentSettlesOnce() public {
        bytes32 invoice = keccak256("INV-1");
        vm.prank(payer);
        router.pay(invoice, provider, 100e6);
        assertEq(token.balanceOf(provider), 100e6);
        vm.expectRevert("invoice already paid");
        vm.prank(payer);
        router.pay(invoice, provider, 100e6);
    }

    function testDirectPaymentRejectsUnverifiedProvider() public {
        vm.expectRevert("provider is not verified");
        vm.prank(payer);
        router.pay(keccak256("INV-2"), makeAddr("unverified"), 1e6);
    }

    function testProviderOnlyEscrowReleasesMilestonesAndCompletes() public {
        uint128[] memory amounts = new uint128[](2);
        amounts[0] = 100e6;
        amounts[1] = 250e6;
        vm.prank(payer);
        uint256 id = escrow.createEscrow(provider, address(0), 0, amounts);
        vm.prank(payer);
        escrow.fundEscrow(id);

        vm.prank(provider);
        escrow.approveMilestone(id, 0);
        escrow.releaseMilestone(id);
        assertEq(token.balanceOf(provider), 100e6);

        vm.expectRevert("provider approval required");
        escrow.releaseMilestone(id);
        vm.prank(provider);
        escrow.approveMilestone(id, 1);
        escrow.releaseMilestone(id);
        assertEq(token.balanceOf(provider), 350e6);
        (,,,,,,,, USDCareTreatmentEscrow.Status status,,) = escrow.escrows(id);
        assertEq(uint8(status), uint8(USDCareTreatmentEscrow.Status.COMPLETED));
    }

    function testDualApprovalRequired() public {
        uint128[] memory amounts = new uint128[](1);
        amounts[0] = 200e6;
        vm.prank(payer);
        uint256 id = escrow.createEscrow(provider, patient, 1, amounts);
        vm.prank(payer);
        escrow.fundEscrow(id);
        vm.prank(provider);
        escrow.approveMilestone(id, 0);
        vm.expectRevert("patient approval required");
        escrow.releaseMilestone(id);
        vm.prank(patient);
        escrow.approveMilestone(id, 0);
        escrow.releaseMilestone(id);
    }

    function testPartialReleaseRefundsRemainingToPayer() public {
        uint128[] memory amounts = new uint128[](2);
        amounts[0] = 100e6;
        amounts[1] = 300e6;
        vm.prank(payer);
        uint256 id = escrow.createEscrow(provider, address(0), 0, amounts);
        vm.prank(payer);
        escrow.fundEscrow(id);
        vm.prank(provider);
        escrow.approveMilestone(id, 0);
        escrow.releaseMilestone(id);
        uint256 beforeRefund = token.balanceOf(payer);
        vm.prank(payer);
        escrow.requestCancellation(id);
        vm.expectRevert("provider approval required");
        vm.prank(payer);
        escrow.refund(id);
        vm.prank(provider);
        escrow.approveCancellation(id);
        vm.prank(payer);
        escrow.refund(id);
        assertEq(token.balanceOf(payer), beforeRefund + 300e6);
    }

    function testFuzzReleasedPlusRefundedEqualsFunded(uint96 firstRaw, uint96 secondRaw) public {
        uint128 first = uint128(bound(uint256(firstRaw), 1, 1_000_000e6));
        uint128 second = uint128(bound(uint256(secondRaw), 1, 1_000_000e6));
        uint128[] memory amounts = new uint128[](2);
        amounts[0] = first;
        amounts[1] = second;
        token.mint(payer, uint256(first) + second);
        uint256 initialPayerBalance = token.balanceOf(payer);

        vm.prank(payer);
        uint256 id = escrow.createEscrow(provider, address(0), 0, amounts);
        vm.prank(payer);
        escrow.fundEscrow(id);
        vm.prank(provider);
        escrow.approveMilestone(id, 0);
        escrow.releaseMilestone(id);
        vm.prank(payer);
        escrow.requestCancellation(id);
        vm.prank(provider);
        escrow.approveCancellation(id);
        vm.prank(payer);
        escrow.refund(id);

        assertEq(token.balanceOf(provider), first);
        assertEq(token.balanceOf(payer), initialPayerBalance - first);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function testPausedContractsRejectActions() public {
        vm.prank(admin);
        router.pause();
        vm.expectRevert();
        vm.prank(payer);
        router.pay(keccak256("INV-3"), provider, 1e6);
        vm.prank(admin);
        escrow.pause();
        uint128[] memory amounts = new uint128[](1);
        amounts[0] = 1e6;
        vm.expectRevert();
        vm.prank(payer);
        escrow.createEscrow(provider, address(0), 0, amounts);
    }
}
