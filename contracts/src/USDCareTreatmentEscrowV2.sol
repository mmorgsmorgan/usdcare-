// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Provider-created healthcare escrow with allowlisted co-funders and evidence-gated releases.
contract USDCareTreatmentEscrowV2 is Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { CREATED, PARTIALLY_FUNDED, FUNDED, COMPLETED, CANCELLED }

    struct Escrow {
        address creator;
        address settlementWallet;
        uint128 totalAmount;
        uint128 fundedAmount;
        uint128 releasedAmount;
        uint32 nextMilestone;
        uint32 milestoneCount;
        uint16 payerCount;
        uint16 requiredPayerApprovals;
        bool openFunding;
        Status status;
    }

    struct Milestone {
        uint128 amount;
        bytes32 evidenceHash;
        uint16 payerApprovalCount;
        bool providerSubmitted;
        bool released;
    }

    IERC20 public immutable USDC;
    address public immutable ADMIN;
    uint256 public nextEscrowId = 1;

    mapping(uint256 => Escrow) public escrows;
    mapping(uint256 => mapping(uint256 => Milestone)) public milestones;
    mapping(uint256 => mapping(address => bool)) public authorizedPayers;
    mapping(uint256 => mapping(address => uint256)) public payerContributions;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public payerMilestoneApprovals;
    mapping(uint256 => mapping(address => bool)) public refundClaimed;

    event EscrowCreated(uint256 indexed escrowId, address indexed creator, address indexed settlementWallet, uint256 totalAmount, uint256 payerCount, uint256 requiredPayerApprovals, bool openFunding);
    event EscrowFunded(uint256 indexed escrowId, address indexed payer, uint256 amount, uint256 fundedAmount);
    event MilestoneEvidenceSubmitted(uint256 indexed escrowId, uint256 indexed milestoneId, bytes32 indexed evidenceHash);
    event MilestoneApproved(uint256 indexed escrowId, uint256 indexed milestoneId, address indexed payer);
    event MilestoneReleased(uint256 indexed escrowId, uint256 indexed milestoneId, uint256 amount);
    event EscrowCancelled(uint256 indexed escrowId);
    event RefundClaimed(uint256 indexed escrowId, address indexed payer, uint256 amount);

    constructor(IERC20 usdcToken, address admin) {
        require(address(usdcToken) != address(0) && admin != address(0), "zero address");
        USDC = usdcToken;
        ADMIN = admin;
    }

    function pause() external { require(msg.sender == ADMIN, "only admin"); _pause(); }
    function unpause() external { require(msg.sender == ADMIN, "only admin"); _unpause(); }

    function createEscrow(address settlementWallet, address[] calldata payers, bool openFunding, uint16 requiredPayerApprovals, uint128[] calldata amounts)
        external whenNotPaused returns (uint256 escrowId)
    {
        require(settlementWallet != address(0), "settlement is zero");
        require(payers.length <= 32 && (openFunding || payers.length > 0), "invalid payers");
        require(requiredPayerApprovals <= payers.length, "invalid approval threshold");
        require(amounts.length > 0 && amounts.length <= 64, "invalid milestones");

        uint128 total;
        escrowId = nextEscrowId++;
        for (uint256 i; i < payers.length; ++i) {
            require(payers[i] != address(0) && !authorizedPayers[escrowId][payers[i]], "invalid payer");
            authorizedPayers[escrowId][payers[i]] = true;
        }
        for (uint256 i; i < amounts.length; ++i) {
            require(amounts[i] > 0, "milestone is zero");
            total += amounts[i];
            milestones[escrowId][i].amount = amounts[i];
        }
        escrows[escrowId] = Escrow({
            creator: msg.sender,
            settlementWallet: settlementWallet,
            totalAmount: total,
            fundedAmount: 0,
            releasedAmount: 0,
            nextMilestone: 0,
            milestoneCount: uint32(amounts.length),
            payerCount: uint16(payers.length),
            requiredPayerApprovals: requiredPayerApprovals,
            openFunding: openFunding,
            status: Status.CREATED
        });
        emit EscrowCreated(escrowId, msg.sender, settlementWallet, total, payers.length, requiredPayerApprovals, openFunding);
    }

    function fundEscrow(uint256 escrowId, uint128 amount) external whenNotPaused nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.openFunding || authorizedPayers[escrowId][msg.sender], "not authorized payer");
        require(escrow.status == Status.CREATED || escrow.status == Status.PARTIALLY_FUNDED, "not fundable");
        require(amount > 0 && uint256(escrow.fundedAmount) + amount <= escrow.totalAmount, "invalid funding amount");
        escrow.fundedAmount += amount;
        payerContributions[escrowId][msg.sender] += amount;
        escrow.status = escrow.fundedAmount == escrow.totalAmount ? Status.FUNDED : Status.PARTIALLY_FUNDED;
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        emit EscrowFunded(escrowId, msg.sender, amount, escrow.fundedAmount);
    }

    function submitMilestoneEvidence(uint256 escrowId, uint256 milestoneId, bytes32 evidenceHash) external whenNotPaused {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.creator, "only creator");
        require(escrow.status == Status.FUNDED, "not active");
        require(milestoneId == escrow.nextMilestone, "not current milestone");
        require(evidenceHash != bytes32(0), "evidence is zero");
        Milestone storage milestone = milestones[escrowId][milestoneId];
        milestone.evidenceHash = evidenceHash;
        milestone.providerSubmitted = true;
        emit MilestoneEvidenceSubmitted(escrowId, milestoneId, evidenceHash);
    }

    function approveMilestone(uint256 escrowId, uint256 milestoneId) external whenNotPaused {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.FUNDED, "not active");
        require(milestoneId == escrow.nextMilestone, "not current milestone");
        require((escrow.openFunding || authorizedPayers[escrowId][msg.sender]) && payerContributions[escrowId][msg.sender] > 0, "not funding payer");
        Milestone storage milestone = milestones[escrowId][milestoneId];
        require(milestone.providerSubmitted, "evidence required");
        require(!payerMilestoneApprovals[escrowId][milestoneId][msg.sender], "already approved");
        payerMilestoneApprovals[escrowId][milestoneId][msg.sender] = true;
        milestone.payerApprovalCount += 1;
        emit MilestoneApproved(escrowId, milestoneId, msg.sender);
    }

    function releaseMilestone(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.FUNDED, "not active");
        Milestone storage milestone = milestones[escrowId][escrow.nextMilestone];
        require(milestone.providerSubmitted, "evidence required");
        require(milestone.payerApprovalCount >= escrow.requiredPayerApprovals, "payer approval required");
        milestone.released = true;
        escrow.releasedAmount += milestone.amount;
        uint256 milestoneId = escrow.nextMilestone++;
        if (escrow.nextMilestone == escrow.milestoneCount) escrow.status = Status.COMPLETED;
        USDC.safeTransfer(escrow.settlementWallet, milestone.amount);
        emit MilestoneReleased(escrowId, milestoneId, milestone.amount);
    }

    function cancelEscrow(uint256 escrowId) external whenNotPaused {
        Escrow storage escrow = escrows[escrowId];
        require(msg.sender == escrow.creator, "only creator");
        require(escrow.status == Status.CREATED || escrow.status == Status.PARTIALLY_FUNDED || escrow.status == Status.FUNDED, "not cancellable");
        escrow.status = Status.CANCELLED;
        emit EscrowCancelled(escrowId);
    }

    function claimRefund(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.CANCELLED, "not cancelled");
        require(!refundClaimed[escrowId][msg.sender], "refund claimed");
        uint256 contribution = payerContributions[escrowId][msg.sender];
        require(contribution > 0, "no contribution");
        refundClaimed[escrowId][msg.sender] = true;
        uint256 amount = contribution * (uint256(escrow.fundedAmount) - escrow.releasedAmount) / escrow.fundedAmount;
        USDC.safeTransfer(msg.sender, amount);
        emit RefundClaimed(escrowId, msg.sender, amount);
    }
}
