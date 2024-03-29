import {
    PublicKey,
    Transaction,
    TransactionInstruction,
    SYSVAR_RENT_PUBKEY,
    SystemProgram,
    Connection,
    Keypair
} from '@solana/web3.js';
import BN from 'bn.js';
import {
    CreateAndTransferToAccountInput,
    CreateAssociatedTokenInput,
    InitializePaymentInput,
    NativeTransferInput,
    SettlePaymentInput,
    GetTransactionSignatureByMemoInpt,
    CreateAssociatedTokenOutput,
    TransferOutput,
    InitializePaymentOutput,
    SettlePaymentOutput,
    ClosePaymentInput
} from './types';
import {
    transfer,
    memoInstruction,
    EscrowLayout,
    Token,
    TokenAccountLayout,
    WRAPPED_SOL_MINT,
    TOKEN_PROGRAM_ID,
    initializeAccount,
    ESCROW_ACCOUNT_DATA_LAYOUT,
    ACCOUNT_LAYOUT,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIx
} from './instructions'; //assertOwner,

export const FAILED_TO_FIND_ACCOUNT = 'Failed to find account';
export const INVALID_ACCOUNT_OWNER = 'Invalid account owner';
export const INVALID_AUTHORITY = 'Invalid authority';
export const INVALID_SIGNATURE = 'Invalid signature';
export const AMOUNT_MISMATCH = 'Amount mismatch';
export const FEE_MISMATCH = 'Fee mismatch';
export const TRANSACTION_SEND_ERROR = 'Transaction send error';

export interface EscrowAccount {
    isInitialized: boolean,
    isSettled: boolean,
    payerPubkey: PublicKey,
    payeePubkey: PublicKey,
    payerTempTokenAccountPubkey: PublicKey,
    authorityPubkey: PublicKey,
    feeTakerPubkey: PublicKey,
    amount: BN,
    fee: BN
}

export class WalletServiceClient {
    private feePayer: Keypair;
    private authority: Keypair;
    private feeTaker: PublicKey;
    private escrowProgram: PublicKey;
    private connection: Connection;

    constructor(feePayer: Keypair, authority: Keypair, feeTaker: PublicKey, connection: Connection, escrowProgram: PublicKey) {
        this.feePayer = feePayer;
        this.authority = authority;
        this.feeTaker = feeTaker;
        this.connection = connection;
        this.escrowProgram = escrowProgram;
    }

    closeEscrowPayment = async (
        input: ClosePaymentInput
    ): Promise<string> => {
        const exchangeInstruction = new TransactionInstruction({
            programId: this.escrowProgram,
            data: Buffer.from(Uint8Array.of(2)),
            keys: [
                { pubkey: this.authority.publicKey, isSigner: true, isWritable: false },
                { pubkey: new PublicKey(input.escrowAddress), isSigner: false, isWritable: true },
                { pubkey: this.feePayer.publicKey, isSigner: false, isWritable: true },
            ]
        })
        const transaction = new Transaction().add(exchangeInstruction);
        if (input.memo) {
            transaction.add(memoInstruction(input.memo, this.authority.publicKey))
        }
        transaction.recentBlockhash = (await this.connection.getRecentBlockhash()).blockhash;
        transaction.feePayer = this.feePayer.publicKey;
        transaction.sign(this.feePayer, this.authority);
        return await this.connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
    }

    createTransferBetweenSplTokenAccounts = async (input: CreateAndTransferToAccountInput): Promise<TransferOutput> => {
        const transaction = new Transaction();
        const walletAddress = new PublicKey(input.walletAddress);
        const sourcePublicKey = new PublicKey(input.sourcePublicKey);
        const destinationPublicKey = new PublicKey(input.destinationPublicKey);
        const transferBetweenAccountsTxn = createTransferBetweenSplTokenAccountsInstructionInternal(
            walletAddress, sourcePublicKey, destinationPublicKey, input.amount, input.memo,
        );
        transaction.add(transferBetweenAccountsTxn);
        transaction.recentBlockhash = input.recentBlockhash;
        transaction.feePayer = this.feePayer.publicKey;
        transaction.partialSign(this.feePayer);
        const signatures = transaction.signatures.filter(signature => !!signature.signature)
            .map(signature => signature.signature!.toString('base64'));
        return {
            signatures,
            message: transaction.serializeMessage().toString('base64'),
        }
    }

    createAndTransferToAccount = async (input: CreateAndTransferToAccountInput): Promise<TransferOutput> => {
        const walletAddress = new PublicKey(input.walletAddress);
        const tokenMintAddress = new PublicKey(input.tokenMintAddress);
        const sourcePublicKey = new PublicKey(input.sourcePublicKey);
        const destinationPublicKey = new PublicKey(input.destinationPublicKey);
        const associatedTokenAddress = await findAssociatedTokenAddress(
            walletAddress,
            tokenMintAddress,
        );
        const createAccountInstruction = createAssociatedTokenAccountIx(
            this.feePayer.publicKey,
            destinationPublicKey,
            tokenMintAddress,
            associatedTokenAddress
        );
        const transaction = new Transaction();
        transaction.add(createAccountInstruction);
        const transferBetweenAccountsTxn = createTransferBetweenSplTokenAccountsInstructionInternal(
            walletAddress, sourcePublicKey, associatedTokenAddress, input.amount, input.memo,
        );
        transaction.add(transferBetweenAccountsTxn);
        transaction.recentBlockhash = input.recentBlockhash;
        transaction.feePayer = this.feePayer.publicKey;
        transaction.partialSign(this.feePayer,);
        const signatures = transaction.signatures.filter(signature => !!signature.signature)
            .map(signature => signature.signature!.toString('base64'));
        return {
            signatures,
            message: transaction.serializeMessage().toString('base64'),
        }
    }

    createAssociatedTokenAccount = async (input: CreateAssociatedTokenInput): Promise<CreateAssociatedTokenOutput> => {
        const walletAddress = new PublicKey(input.walletAddress);
        const tokenMintAddress = new PublicKey(input.tokenMintAddress);
        const associatedTokenAddress = await findAssociatedTokenAddress(
            walletAddress,
            tokenMintAddress,
        );
        const ix = createAssociatedTokenAccountIx(
            this.feePayer.publicKey,
            walletAddress,
            tokenMintAddress,
            associatedTokenAddress
        );
        const tx = new Transaction({ feePayer: this.feePayer.publicKey });
        tx.recentBlockhash = input.recentBlockhash;
        tx.add(ix);
        tx.sign(this.feePayer);
        const signatures = tx.signatures.filter(signature => !!signature.signature)
            .map(signature => signature.signature!.toString('base64'));
        return {
            signatures,
            address: associatedTokenAddress.toBase58(),
            message: tx.serializeMessage().toString('base64'),
        }
    }

    createAssociatedTokenAccountInternal = async (
        owner: PublicKey,
        tokenMintAddress: PublicKey,
        associatedAddress: PublicKey,
    ): Promise<PublicKey> => {
        await this.connection.sendTransaction(new Transaction().add(
            createAssociatedTokenAccountIx(
                this.feePayer.publicKey,
                owner,
                tokenMintAddress,
                associatedAddress
            ),
        ), [this.feePayer], {
            skipPreflight: false,
        })
        return associatedAddress;
    }

    findTransactionSignatureByMemo = async (input: GetTransactionSignatureByMemoInpt): Promise<string | null> => {
        const transactionStatuses = await this.connection.getConfirmedSignaturesForAddress2(new PublicKey(input.walletAddress), {
            until: input.until,
        })
        const transaction = transactionStatuses.find(status => status.memo === input.memo);
        if (!transaction) {
            return null;
        }
        return transaction.signature
    }

    getOrCreateAssociatedAccountInfo = async (
        walletAddress: PublicKey,
        splTokenMintAddress: PublicKey,
    ): Promise<Token> => {
        const associatedAddress = await findAssociatedTokenAddress(
            walletAddress,
            splTokenMintAddress,
        );

        // This is the optimum logic, considering TX fee, client-side computation,
        // RPC roundtrips and guaranteed idempotent.
        // Sadly we can't do this atomically;
        try {
            return await this.getTokenAccountInfo(associatedAddress);
        } catch (err) {
            // INVALID_ACCOUNT_OWNER can be possible if the associatedAddress has
            // already been received some lamports (= became system accounts).
            // Assuming program derived addressing is safe, this is the only case
            // for the INVALID_ACCOUNT_OWNER in this code-path
            if (
                err.message === FAILED_TO_FIND_ACCOUNT ||
                err.message === INVALID_ACCOUNT_OWNER
            ) {
                // as this isn't atomic, it's possible others can create associated
                // accounts meanwhile
                try {
                    await this.createAssociatedTokenAccountInternal(
                        walletAddress,
                        splTokenMintAddress,
                        associatedAddress,
                    );
                } catch (err) {
                    // ignore all errors; for now there is no API compatible way to
                    // selectively ignore the expected instruction error if the
                    // associated account is existing already.
                }

                // Now this should always succeed
                return this.getTokenAccountInfo(associatedAddress);
            } else {
                throw err;
            }
        }
    }

    getTokenAccountInfo = async (walletAddress: PublicKey,): Promise<Token> => {
        const info = await this.connection.getAccountInfo(walletAddress);
        if (!info) {
            throw new Error(FAILED_TO_FIND_ACCOUNT);
        }
        if (!info.owner.equals(TOKEN_PROGRAM_ID)) {
            throw new Error(INVALID_ACCOUNT_OWNER);
        }
        if (info.data.length !== TokenAccountLayout.span) {
            throw new Error(`Invalid account size`);
        }

        const data = Buffer.from(info.data);
        const accountInfo = TokenAccountLayout.decode(data) as any;
        accountInfo.address = walletAddress;
        accountInfo.mint = new PublicKey(accountInfo.mint);
        accountInfo.owner = new PublicKey(accountInfo.owner);
        accountInfo.amount = new BN(accountInfo.amount, 10, "le")

        if (accountInfo.delegateOption === 0) {
            accountInfo.delegate = null;
            accountInfo.delegatedAmount = new BN(0);
        } else {
            accountInfo.delegate = new PublicKey(accountInfo.delegate);
            accountInfo.delegatedAmount = new BN(accountInfo.delegatedAmount, 10, "le");
        }

        accountInfo.isInitialized = accountInfo.state !== 0;
        accountInfo.isFrozen = accountInfo.state === 2;

        if (accountInfo.isNativeOption === 1) {
            accountInfo.rentExemptReserve = new BN(accountInfo.isNative, 10, "le")
            accountInfo.isNative = true;
        } else {
            accountInfo.rentExemptReserve = null;
            accountInfo.isNative = false;
        }

        if (accountInfo.closeAuthorityOption === 0) {
            accountInfo.closeAuthority = null;
        } else {
            accountInfo.closeAuthority = new PublicKey(accountInfo.closeAuthority);
        }
        return accountInfo as Token
    }

    initializeEscrowPayment = async (
        input: InitializePaymentInput): Promise<InitializePaymentOutput> => {
        const walletAddress = new PublicKey(input.walletAddress);
        const tokenMintAddress = new PublicKey(input.tokenMintAddress);
        const tokenAccountAddress = new PublicKey(input.tokenAccountAddress);
        const tempTokenAccount = new Keypair();
        let transferXTokensToTempAccIx;
        const createTempTokenAccountIx = SystemProgram.createAccount({
            programId: TOKEN_PROGRAM_ID,
            space: ACCOUNT_LAYOUT.span,
            lamports: await this.connection.getMinimumBalanceForRentExemption(ACCOUNT_LAYOUT.span),
            fromPubkey: this.feePayer.publicKey,
            newAccountPubkey: tempTokenAccount.publicKey
        });
        const initTempAccountIx = initializeAccount(tempTokenAccount.publicKey, tokenMintAddress, walletAddress);

        if (tokenMintAddress.equals(WRAPPED_SOL_MINT)) {
            transferXTokensToTempAccIx = SystemProgram.transfer({
                fromPubkey: tokenAccountAddress,
                toPubkey: tempTokenAccount.publicKey,
                lamports: input.amount
            })
        } else {
            transferXTokensToTempAccIx = transfer(tokenAccountAddress, tempTokenAccount.publicKey, input.amount, walletAddress);
        }
        const escrowAccount = new Keypair();

        const createEscrowAccountIx = SystemProgram.createAccount({
            space: ESCROW_ACCOUNT_DATA_LAYOUT.span,
            lamports: await this.connection.getMinimumBalanceForRentExemption(ESCROW_ACCOUNT_DATA_LAYOUT.span, 'singleGossip'),
            fromPubkey: this.feePayer.publicKey,
            newAccountPubkey: escrowAccount.publicKey,
            programId: this.escrowProgram
        });

        const initEscrowIx = new TransactionInstruction({
            programId: this.escrowProgram,
            keys: [
                { pubkey: walletAddress, isSigner: true, isWritable: false },
                { pubkey: tempTokenAccount.publicKey, isSigner: false, isWritable: true },
                { pubkey: this.authority.publicKey, isSigner: true, isWritable: false },
                { pubkey: escrowAccount.publicKey, isSigner: false, isWritable: true },
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            data: Buffer.from(Uint8Array.of(0, ...new BN(input.amount).toArray("le", 8)))
        })
        const transaction = new Transaction()
            .add(createTempTokenAccountIx);
        if (tokenMintAddress.equals(WRAPPED_SOL_MINT)) {
            transaction.add(transferXTokensToTempAccIx, initTempAccountIx, createEscrowAccountIx, initEscrowIx,)
        } else {
            transaction.add(initTempAccountIx, transferXTokensToTempAccIx, createEscrowAccountIx, initEscrowIx,)
        }
        if (input.memo) {
            transaction.add(memoInstruction(input.memo, this.authority.publicKey))
        }
        transaction.recentBlockhash = (await this.connection.getRecentBlockhash()).blockhash;
        transaction.feePayer = this.feePayer.publicKey;
        transaction.partialSign(this.feePayer, escrowAccount, tempTokenAccount,);
        const signatures = transaction.signatures.map(sig => ({ signature: sig.signature && sig.signature.toString('base64'), pubKey: sig.publicKey.toBase58() }));
        return {
            message: transaction.serializeMessage().toString('base64'),
            signatures: signatures,
            escrowAddress: escrowAccount.publicKey.toBase58()
        }
    }

    sendEscrowPayment = async (payload: string): Promise<string> => {
        const buffer = Buffer.from(payload, 'base64');
        const txIx = Transaction.from(buffer)
        if (!txIx.verifySignatures()) {
            throw Error(INVALID_SIGNATURE)
        }
        return this.connection.sendRawTransaction(buffer, {
            skipPreflight: false,
        })
    };

    settleEscrowPayment = async (
        input: SettlePaymentInput
    ): Promise<SettlePaymentOutput> => {
        const walletAddress = new PublicKey(input.walletAddress);
        const escrowAddress = new PublicKey(input.escrowAddress);
        const info = await this.connection.getAccountInfo(escrowAddress);
        if (!info) {
            throw new Error(FAILED_TO_FIND_ACCOUNT);
        }
        if (!info.owner.equals(this.escrowProgram)) {
            throw new Error(INVALID_ACCOUNT_OWNER);
        }
        const accountInfo = ESCROW_ACCOUNT_DATA_LAYOUT.decode(info.data) as EscrowLayout;
        const escrowState = {
            escrowAddress,
            isInitialized: !!accountInfo.isInitialized,
            isSettled: !!accountInfo.isSettled,
            payerPubkey: accountInfo.payerPubkey,
            payeePubkey: accountInfo.payeePubkey,
            payerTempTokenAccountPubkey: accountInfo.payerTempTokenAccountPubkey,
            authorityPubkey: accountInfo.authorityPubkey,
            feeTakerPubkey: accountInfo.feeTakerPubkey,
            expectedAmount: new BN(accountInfo.amount, 10, "le"),
            fee: new BN(accountInfo.fee, 10, "le")
        };
        const expectedAmount = new BN(input.amount);
        const fee = new BN(input.fee || 0);

        if (!expectedAmount.eq(escrowState.expectedAmount)) {
            throw new Error(AMOUNT_MISMATCH);
        }
        if (!this.authority.publicKey.equals(escrowState.authorityPubkey)) {
            throw new Error(INVALID_AUTHORITY);
        }
        const token = await this.getTokenAccountInfo(escrowState.payerTempTokenAccountPubkey);
        let takerAccount = walletAddress;
        let feeTakerAccount = this.feeTaker;

        if (!token.isNative) {
            takerAccount = (await this.getOrCreateAssociatedAccountInfo(walletAddress, token.mint)).address;
            feeTakerAccount = (await this.getOrCreateAssociatedAccountInfo(this.feeTaker, token.mint)).address;
        }
        const PDA = await PublicKey.findProgramAddress([Buffer.from("escrow")], this.escrowProgram);
        const exchangeInstruction = new TransactionInstruction({
            programId: this.escrowProgram,
            data: Buffer.from(Uint8Array.of(1, ...fee.toArray("le", 8))),
            keys: [
                { pubkey: this.authority.publicKey, isSigner: true, isWritable: false },
                { pubkey: takerAccount, isSigner: false, isWritable: true },
                { pubkey: feeTakerAccount, isSigner: false, isWritable: true },
                { pubkey: escrowState.payerTempTokenAccountPubkey, isSigner: false, isWritable: true },
                { pubkey: escrowAddress, isSigner: false, isWritable: true },
                { pubkey: this.feePayer.publicKey, isSigner: false, isWritable: true },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: PDA[0], isSigner: false, isWritable: false }
            ]
        })
        const transaction = new Transaction().add(exchangeInstruction);
        if (input.memo) {
            transaction.add(memoInstruction(input.memo, this.authority.publicKey))
        }
        transaction.recentBlockhash = (await this.connection.getRecentBlockhash()).blockhash;
        transaction.feePayer = this.feePayer.publicKey;
        transaction.sign(this.feePayer, this.authority);
        try {
            const signature = await this.connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
            return { signature, destinationWalletAddress: takerAccount.toBase58() }
        } catch (error) {
            const newError: any = new Error(TRANSACTION_SEND_ERROR);
            newError.destinationWalletAddress = takerAccount
            throw newError;
        }
    }

    signTransaction = (
        transaction: Transaction,
    ): Buffer => {
        transaction.feePayer = this.feePayer.publicKey;
        transaction.partialSign(this.feePayer);
        return transaction.serialize();
    }

    nativeTransferTx = async (
        input: NativeTransferInput
    ): Promise<TransferOutput> => {
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: new PublicKey(input.walletAddress),
                toPubkey: new PublicKey(input.destinationPublicKey),
                lamports: input.amount,
            }),
        );
        transaction.recentBlockhash = input.recentBlockhash;
        transaction.feePayer = this.feePayer.publicKey;
        transaction.partialSign(this.feePayer,);
        const signatures = transaction.signatures.filter(signature => !!signature.signature)
            .map(signature => signature.signature!.toString('base64'));
        return {
            signatures,
            message: transaction.serializeMessage().toString('base64'),
        }
    }
}

const findAssociatedTokenAddress = async (
    walletAddress: PublicKey,
    tokenMintAddress: PublicKey,
) => {
    return (
        await PublicKey.findProgramAddress(
            [
                walletAddress.toBuffer(),
                TOKEN_PROGRAM_ID.toBuffer(),
                tokenMintAddress.toBuffer(),
            ],
            ASSOCIATED_TOKEN_PROGRAM_ID,
        )
    )[0];
}


const createTransferBetweenSplTokenAccountsInstructionInternal = (
    ownerPublicKey: PublicKey,
    sourcePublicKey: PublicKey,
    destinationPublicKey: PublicKey,
    amount: number,
    memo?: string,
): Transaction => {
    const transaction = new Transaction().add(
        transfer(sourcePublicKey, destinationPublicKey, amount, ownerPublicKey),
    );
    if (memo) {
        transaction.add(memoInstruction(memo));
    }
    return transaction;
}

