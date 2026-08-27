// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {USDCareTreatmentEscrowV2} from "../src/USDCareTreatmentEscrowV2.sol";

contract DeployV2 is Script {
    function run() external returns (USDCareTreatmentEscrowV2 escrow) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envOr("USCARE_ADMIN_ADDRESS", vm.addr(deployerKey));
        address usdc = vm.envAddress("USDC_TOKEN_ADDRESS");
        vm.startBroadcast(deployerKey);
        escrow = new USDCareTreatmentEscrowV2(IERC20(usdc), admin);
        vm.stopBroadcast();
    }
}
