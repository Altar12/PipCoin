//View coin on solana explorer https://explorer.solana.com/address/F2ftp18P26RvnTvYbrDNJTQipwwBLpE4WiVaLL8V1kQp?cluster=devnet

import { initializeKeypair } from "./initializeKeypair"
import * as web3 from "@solana/web3.js"
import { Metaplex, keypairIdentity, bundlrStorage, toMetaplexFile, findMetadataPda } from "@metaplex-foundation/js"
import { DataV2, createCreateMetadataAccountV2Instruction } from "@metaplex-foundation/mpl-token-metadata"
import * as fs from "fs"
import { struct, u32, u8 } from "@solana/buffer-layout"
import { bool, publicKey, u64 } from "@solana/buffer-layout-utils" 

const TOKEN_PROGRAM_ID = new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
const ASSOCIATED_TOKEN_PROGRAM_ID = new web3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

//initialize mint instruction
enum TokenInstruction {
  InitializeMint = 0,
  InitializeAccount = 1,
  InitializeMultisig = 2,
  Transfer = 3,
  Approve = 4,
  Revoke = 5,
  SetAuthority = 6,
  MintTo = 7,
  Burn = 8,
  CloseAccount = 9,
  FreezeAccount = 10,
  ThawAccount = 11,
  TransferChecked = 12,
  ApproveChecked = 13,
  MintToChecked = 14,
  BurnChecked = 15,
  InitializeAccount2 = 16,
  SyncNative = 17,
  InitializeAccount3 = 18,
  InitializeMultisig2 = 19,
  InitializeMint2 = 20,
}

interface InitializeMintInstructionData {
  instruction: TokenInstruction.InitializeMint,
  decimals: number,
  mintAuthority: web3.PublicKey,
  freezeAuthorityOption: 1|0,
  freezeAuthority: web3.PublicKey,
}

const initializeMintInstructionData = struct<InitializeMintInstructionData> ([
  u8("instruction"), u8("decimals"), publicKey("mintAuthority"), u8("freezeAuthorityOption"), publicKey("freezeAuthority")
])

function createInitializeMintIx(
  mint: web3.PublicKey,
  decimals: number,
  mintAuthority: web3.PublicKey,
  freezeAuthority: web3.PublicKey|null,
  programId = TOKEN_PROGRAM_ID
): web3.TransactionInstruction {
  const keys = [
    { pubkey: mint, isSigner: false, isWritable: true},
    { pubkey: web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false}
  ]
  const data = Buffer.alloc(initializeMintInstructionData.span)
  initializeMintInstructionData.encode({
    instruction: TokenInstruction.InitializeMint,
    decimals,
    mintAuthority,
    freezeAuthorityOption: freezeAuthority? 1:0,
    freezeAuthority: freezeAuthority || new web3.PublicKey(0)
  }, data)
  return new web3.TransactionInstruction({keys, programId, data})
}


//'create mint' instruction
interface RawMint {
  mintAuthorityOption: 1 | 0;
  mintAuthority: web3.PublicKey;
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthorityOption: 1 | 0;
  freezeAuthority: web3.PublicKey;
}

/** Buffer layout for de/serializing a mint */
const MintLayout = struct<RawMint>([
  u32('mintAuthorityOption'),
  publicKey('mintAuthority'),
  u64('supply'),
  u8('decimals'),
  bool('isInitialized'),
  u32('freezeAuthorityOption'),
  publicKey('freezeAuthority'),
]);

/** Byte length of a mint */
const MINT_SIZE = MintLayout.span

//'create metadata acc' instruction
async function createCreateMetadataAccIx(
  metaplex: Metaplex,
  mint: web3.PublicKey,
  user: web3.Keypair,
  name: string,
  symbol: string,
  description: string
) {
  const buffer = fs.readFileSync("assets/piplup.png")
  const file = toMetaplexFile(buffer, "piplup.png")

  const imageUri = await metaplex.storage().upload(file)
  console.log("Image uri", imageUri)

  const { uri } = await metaplex.nfts().uploadMetadata({
    name: name,
    description: description,
    image: imageUri
  })
  console.log("Metadata uri", uri)

  const metadataPda = await findMetadataPda(mint)
  const tokenMetadata = {
    name: name,
    symbol: symbol,
    uri: uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null
  } as DataV2

  return createCreateMetadataAccountV2Instruction(
      {
        metadata: metadataPda,
        mint: mint,
        mintAuthority: user.publicKey,
        updateAuthority: user.publicKey,
        payer: user.publicKey
      },
      {
        createMetadataAccountArgsV2: {
          data: tokenMetadata,
          isMutable: true
        }
      }
    )
}

// 'create associated token account' instruction
async function createCreateAssociatedTokenAccIx(
  payer: web3.PublicKey,
  mint: web3.PublicKey,
  owner: web3.PublicKey,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): Promise<web3.TransactionInstruction> {

  const [address] = await web3.PublicKey.findProgramAddress(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId
  )

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: address, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: programId, isSigner: false, isWritable: false },
    { pubkey: web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
];

return new web3.TransactionInstruction({
    keys,
    programId: associatedTokenProgramId,
    data: Buffer.alloc(0),
});

}

// mint to instruction
interface MintToInstructionData {
  instruction: TokenInstruction.MintTo,
  amount: bigint,
}
const mintToInstructionData = struct<MintToInstructionData>([u8("instruction"), u64("amount")])


function createMintToIx(
  mint: web3.PublicKey,
  destination: web3.PublicKey,
  authority: web3.PublicKey,
  amount: number|bigint,
  programId = TOKEN_PROGRAM_ID
): web3.TransactionInstruction {

  const keys = [
    {pubkey: mint, isSigner: false, isWritable: true},
    {pubkey: destination, isSigner: false, isWritable: true},
    {pubkey: authority, isSigner: true, isWritable: false}
  ]
  const data = Buffer.alloc(mintToInstructionData.span)
  mintToInstructionData.encode({
    instruction: TokenInstruction.MintTo,
    amount: BigInt(amount),
  }, data)
  return new web3.TransactionInstruction({keys, programId, data})
}

async function createAndInitializeMint(
  connection: web3.Connection,
  payer: web3.Keypair,
  mintAuthority: web3.PublicKey,
  freezeAuthority: web3.PublicKey,
  decimals: number,
  metaplex: Metaplex,
  name: string,
  symbol: string,
  description: string,
  createTokenAccount: boolean,
  amount: number
) {
  const mint = web3.Keypair.generate()
  const mintAccount = mint.publicKey
  const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE)
  const transaction = new web3.Transaction()
  const createMintIx = web3.SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mintAccount,
    space: MINT_SIZE,
    lamports,
    programId: TOKEN_PROGRAM_ID
  })
  const initializeMintIx = createInitializeMintIx(mintAccount, decimals, mintAuthority, freezeAuthority, TOKEN_PROGRAM_ID)
  try {
    const createMetadataIx = await createCreateMetadataAccIx(metaplex, mintAccount, payer, name, symbol, description)
    const createTokenAccIx = await createCreateAssociatedTokenAccIx(payer.publicKey, mintAccount, payer.publicKey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    const [address] = await web3.PublicKey.findProgramAddress(
      [payer.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintAccount.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
    const mintToIx = createMintToIx(mintAccount, address, payer.publicKey, amount * 10**decimals, TOKEN_PROGRAM_ID)

    transaction.add(createMintIx).add(initializeMintIx).add(createMetadataIx)

    if (createTokenAccount) {
      transaction.add(createTokenAccIx).add(mintToIx)
    }
    const txnSignature = await web3.sendAndConfirmTransaction(connection, transaction, [payer, mint])
    console.log(`Transfer Token Transaction: https://explorer.solana.com/tx/${txnSignature}?cluster=devnet`)
  } catch (err) {
    console.log(err)
  }
}

async function main() {
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"))
  const user = await initializeKeypair(connection)

  console.log("PublicKey:", user.publicKey.toBase58())

  const metaplex = Metaplex.make(connection).use(keypairIdentity(user))
                      .use(bundlrStorage({
                        address: "https://devnet.bundlr.network",
                        providerUrl: "https://api.devnet.solana.com",
                        timeout: 60000,
                      }))
  
  await createAndInitializeMint(connection, user, user.publicKey, user.publicKey, 2, metaplex, "Pip", "PIP", "Piplup stamped coins", true, 100)

}

main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
