import { getAddress, type Address } from "viem";
export { GAME_ABI } from "./game-abi";
export { SUPPORTED_CHAIN } from "./chain";

const configuredAddress = process.env.NEXT_PUBLIC_GAME_CONTRACT_ADDRESS ||
  "0xc2df02602efd8e4459064bb752c8bd1da0f8d6a8";
export const GAME_CONTRACT_ADDRESS: Address = getAddress(configuredAddress);
