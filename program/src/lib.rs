pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

#[cfg(not(feature = "no-entrypoint"))]
pub mod entrypoint;

use solana_program::{
    declare_id, entrypoint::ProgramResult, pubkey::Pubkey,
};

declare_id!("My11111111111111111111111111111111111111111");

/// Checks that the supplied authority ID is the correct one for SPL-token
pub fn check_authority_account(escrow_authority_id: &Pubkey) -> ProgramResult {
    if escrow_authority_id != &id() {
        return Err(error::EscrowError::InvalidAuthorityId.into());
    }
    Ok(())
}
