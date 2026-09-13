import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  Connection,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
const base58 = require("bs58");

export async function sendSol(to: string, amount: string) {
  if (!process.env.SOL_PRIVATE_KEY || !process.env.SOLANA_RPC_URL)
    throw new Error("Solana action is not configured");
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0)
    throw new Error("Solana amount must be a positive number");
  const connection = new Connection(process.env.SOLANA_RPC_URL, "finalized");
  const keypair = Keypair.fromSecretKey(
    base58.decode(process.env.SOL_PRIVATE_KEY),
  );
  const transferTransaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(to),
      lamports: Math.round(numericAmount * LAMPORTS_PER_SOL),
    }),
  );

  await sendAndConfirmTransaction(connection, transferTransaction, [keypair]);
}
