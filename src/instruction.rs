// inside instruction.rs
use solana_program::program_error::ProgramError;
use std::convert::TryInto;

use crate::error::EscrowError::InvalidInstruction;

pub enum EscrowInstruction {
    /// Starts the trade by creating and populating an escrow account and transferring ownership of the given temp token account to the PDA
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the payer initializing the escrow
    /// 1. `[signer]` The escrow authority responsible for approving / refunding payments due to some external conditions
    /// 2. `[writable]`Payer's Temporary token account that should be created prior to this instruction and owned by the initializer
    /// 3. `[]` The payer's token account for the token they will receive if refunded
    /// 4. `[writable]` The escrow account, it will hold all necessary info about the trade.
    /// 5. `[]` The rent sysvar
    /// 6. `[]` The token program
    InitEscrow {
        /// The total amount of token X to be paid by the payer
        amount: u64,
        /// the amount the fee taker expects to be paid from amount
        fee: u64,
    },
    /// Accepts a trade
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority 
    /// 1. `[writable]` The taker's token account for the token they will receive should the trade go through
    /// 2. `[writable]` The fee taker's token account for the token they will receive should the trade go through
    /// 3. `[writable]` The PDA's temp token account to get tokens from and eventually close
    /// 4. `[writable]` The fee payer's main account to send their rent fees to
    /// 5. `[writable]` The initializer's token account that will receive tokens
    /// 6. `[writable]` The escrow account holding the escrow info
    /// 7. `[]` The token program
    /// 8. `[]` The PDA account
    Settle,
}

impl EscrowInstruction {
    /// Unpacks a byte buffer into a [EscrowInstruction](enum.EscrowInstruction.html).
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (tag, rest) = input.split_first().ok_or(InvalidInstruction)?;

        Ok(match tag {
            0 => Self::InitEscrow {
                amount: Self::unpack_amount(rest)?,
                fee: Self::unpack_amount(&rest[8..])?,
            },
            1 => Self::Settle,
            _ => return Err(InvalidInstruction.into()),
        })
    }

    fn unpack_amount(input: &[u8]) -> Result<u64, ProgramError> {
        input
            .get(..8)
            .and_then(|slice| slice.try_into().ok())
            .map(u64::from_le_bytes)
            .ok_or(InvalidInstruction.into())
    }
}
