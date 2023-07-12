import {
  $query,
  $update,
  Record,
  StableBTreeMap,
  Vec,
  match,
  Result,
  nat64,
  ic,
  Opt,
  Principal,
} from "azle";
import { v4 as uuidv4 } from "uuid";

// Define the data structure for a DAO (Decentralized Autonomous Organization)
type Dao = Record<{
  id: string; // Unique identifier for the DAO
  name: string; // Name of the DAO
  short_desc: string; // Short description of the DAO
  owner: Principal; // Principal representing the owner of the DAO
  members: Vec<Principal>; // List of principals representing the members of the DAO
  createdAt: nat64; // Timestamp when the DAO was created
  updatedAt: Opt<nat64>; // Optional timestamp when the DAO was last updated
}>;

// Define the payload data structure for creating or updating a DAO
type DaoPayload = Record<{
  name: string; // Name of the DAO
  short_desc: string; // Short description of the DAO
  avatar: string; // Avatar image URL for the DAO
}>;

// Define the data structure for a proposal within a DAO
type Proposal = Record<{
  id: string; // Unique identifier for the proposal
  title: string; // Title of the proposal
  details: string; // Details or description of the proposal
  owner: Principal; // Principal representing the owner of the proposal
  votes: Vec<Principal>; // List of members that has voted
  daoId: string; // Identifier of the DAO to which the proposal belongs
  createdAt: nat64; // Timestamp when the proposal was created
  updatedAt: Opt<nat64>; // Optional timestamp when the proposal was last updated
}>;

// Define the payload data structure for creating a proposal
type ProposalPayload = Record<{
  title: string; // Title of the proposal
  details: string; // Details or description of the proposal
  daoId: string; // Identifier of the DAO to which the proposal belongs
}>;

// Define the payload data structure for editing a proposal
type EditProposalPayload = Record<{
  id: string; // Identifier of the propsosal
  title: string; // Title of the proposal
  details: string; // Details or description of the proposal
}>;

// Create a storage map for DAOs
const daoStorage = new StableBTreeMap<string, Dao>(0, 44, 1024);

// Create a storage map for proposals
const proposalStorage = new StableBTreeMap<string, Proposal>(1, 44, 1024);

$query;
// Retrieve the DAOs that the current user is a member of
export function getDaosForUser(): Result<Vec<Dao>, string> {
  const daos = daoStorage.values();
  const userDaos: Dao[] = [];

  // Iterate through all DAOs and check if the caller is a member
  for (const dao of daos) {
    if (dao.members.map(String).includes(ic.caller().toString())) {
      userDaos.push(dao);
    }
  }

  return Result.Ok(userDaos);
}

$query;
// Retrieve a specific DAO by its ID
export function getDao(id: string): Result<Dao, string> {
  return match(daoStorage.get(id), {
    Some: (dao: Dao) => Result.Ok<Dao, string>(dao),
    None: () => Result.Err<Dao, string>(`A dao with id=${id} was not found.`),
  });
}

$update;
// Create a new DAO
export function createDao(payload: DaoPayload): Result<Dao, string> {
  const dao: Dao = {
    id: uuidv4(), // Generate a unique ID using uuidv4
    createdAt: ic.time(), // Set the creation timestamp to the current time
    updatedAt: Opt.None, // Set the update timestamp as None initially
    owner: ic.caller(), // Set the owner as the caller
    members: [ic.caller()], // Add the caller to the members list
    ...payload, // Spread the payload properties
  };

  daoStorage.insert(dao.id, dao); // Insert the created DAO into the storage
  return Result.Ok(dao);
}

$update;
// Update a DAO by its ID
export function updateDao(
  id: string,
  payload: DaoPayload
): Result<Dao, string> {
  return match(daoStorage.get(id), {
    Some: (dao: Dao) => {
      if (dao.owner.toString() !== ic.caller().toString()) {
        return Result.Err<Dao, string>(
          `You are not authorized to update the dao.`
        );
      }
      const updatedDao: Dao = {
        ...dao,
        ...payload,
        updatedAt: Opt.Some(ic.time()), // Set the update timestamp to the current time
      };

      daoStorage.insert(dao.id, updatedDao); // Update the DAO in the storage
      return Result.Ok<Dao, string>(updatedDao);
    },
    None: () =>
      Result.Err<Dao, string>(
        `Couldn't update a dao with id=${id}. Dao not found.`
      ),
  });
}

$update;
// Add members to a DAO
export function addMembersToDao(
  id: string,
  member: Principal
): Result<Dao, string> {
  return match(daoStorage.get(id), {
    Some: (dao: Dao) => {
      if (dao.owner.toString() !== ic.caller().toString()) {
        return Result.Err<Dao, string>(`You are not the owner of the dao.`);
      }

      dao.members.push(member); // Add the member to the members list
      daoStorage.insert(dao.id, dao); // Update the DAO in the storage
      return Result.Ok<Dao, string>(dao);
    },
    None: () =>
      Result.Err<Dao, string>(
        `Couldn't update a dao with id=${id}. Dao not found.`
      ),
  });
}

$update;
// Delete a DAO by its ID
export function deleteDao(id: string): Result<Dao, string> {
  return match(daoStorage.get(id), {
    Some: (dao: Dao) => {
      if (dao.owner.toString() !== ic.caller().toString()) {
        return Result.Err<Dao, string>(
          `You are not authorized to delete the dao.`
        );
      }

      // Remove proposals associated with the DAO
      const proposals = proposalStorage.values();
      for (const proposal of proposals) {
        if (proposal.daoId === id) {
          proposalStorage.remove(proposal.id);
        }
      }

      daoStorage.remove(id); // Remove the DAO from the storage
      return Result.Ok<Dao, string>(dao);
    },
    None: () => {
      return Result.Err<Dao, string>(
        `Couldn't delete a dao with id=${id}. Dao not found.`
      );
    },
  });
}

$update;
// Create a new proposal within a DAO
export function createProposal(
  payload: ProposalPayload
): Result<Proposal, string> {
  return match(daoStorage.get(payload.daoId), {
    Some: (dao: Dao) => {
      const isMember = dao.members.map(String).includes(ic.caller().toString());
      if (!isMember) {
        return Result.Err<Proposal, string>(`You don't belong to this dao.`);
      }

      const proposal: Proposal = {
        id: uuidv4(), // Generate a unique ID using uuidv4
        owner: ic.caller(), // Set the owner as the caller
        createdAt: ic.time(), // Set the creation timestamp to the current time
        updatedAt: Opt.None, // Set the update timestamp as None initially
        votes: [], // Initialize the votes list as empty
        ...payload, // Spread the payload properties
      };
      proposalStorage.insert(proposal.id, proposal); // Insert the created proposal into the storage
      return Result.Ok<Proposal, string>(proposal);
    },
    None: () =>
      Result.Err<Proposal, string>(
        `A dao with id=${payload.daoId} was not found.`
      ),
  });
}

$update;
// Vote on a proposal within a DAO
export function voteOnProposal(
  daoId: string,
  id: string
): Result<Proposal, string> {
  return match(daoStorage.get(daoId), {
    Some: (dao: Dao) => {
      const isMember = dao.members.map(String).includes(ic.caller().toString());
      if (!isMember) {
        return Result.Err<Proposal, string>(`You don't belong to this dao.`);
      }

      return match(proposalStorage.get(id), {
        Some: (proposal: Proposal) => {
          if (proposal.votes.map(String).includes(ic.caller().toString())) {
            return Result.Err<Proposal, string>(`You have already voted`);
          }

          proposal.votes.push(ic.caller()); // Add the caller to the votes list
          proposalStorage.insert(proposal.id, proposal); // Update the proposal in the storage
          return Result.Ok<Proposal, string>(proposal);
        },
        None: () => {
          return Result.Err<Proposal, string>(
            `A proposal with id=${id} was not found.`
          );
        },
      });
    },
    None: () => {
      return Result.Err<Proposal, string>(
        `A dao with id=${daoId} was not found.`
      );
    },
  });
}

$update;
// Edit a proposal within a DAO
export function editProposal(
  payload: EditProposalPayload
): Result<Proposal, string> {
  return match(proposalStorage.get(payload.id), {
    Some: (proposal: Proposal) => {
      if (proposal.owner.toString() !== ic.caller().toString()) {
        return Result.Err<Proposal, string>(
          `You are not authorized to update the proposal.`
        );
      }

      const updatedProposal: Proposal = {
        ...proposal,
        ...payload,
        updatedAt: Opt.Some(ic.time()), // Set the update timestamp to the current time
      };

      proposalStorage.insert(proposal.id, updatedProposal); // Update the proposal in the storage
      return Result.Ok<Proposal, string>(updatedProposal);
    },
    None: () =>
      Result.Err<Proposal, string>(
        `Couldn't update a proposal with id=${payload.id}. Proposal not found.`
      ),
  });
}

$query;
// Get the number of votes for a proposal within a DAO
export function getVotesForProposal(
  daoId: string,
  proposalId: string
): Result<number, string> {
  const proposal = getProposal(daoId, proposalId);
  if (proposal.Err) {
    return Result.Err<number, string>(proposal.Err);
  }

  return Result.Ok<number, string>(proposal.Ok?.votes.length || 0);
}

$query;
// Get a specific proposal within a DAO
export function getProposal(
  daoId: string,
  proposalId: string
): Result<Proposal, string> {
  return match(daoStorage.get(daoId), {
    Some: (dao: Dao) => {
      const isMember = dao.members.map(String).includes(ic.caller().toString());
      if (!isMember) {
        return Result.Err<Proposal, string>(`You don't belong to this dao.`);
      }

      return match(proposalStorage.get(proposalId), {
        Some: (proposal: Proposal) => {
          return Result.Ok<Proposal, string>(proposal);
        },
        None: () => {
          return Result.Err<Proposal, string>(
            `A proposal with id=${proposalId} was not found.`
          );
        },
      });
    },
    None: () => {
      return Result.Err<Proposal, string>(
        `A dao with id=${daoId} was not found.`
      );
    },
  });
}

$query;
// Get all proposals within a DAO
export function getProposalsForDao(
  daoId: string
): Result<Vec<Proposal>, string> {
  return match(daoStorage.get(daoId), {
    Some: (dao: Dao) => {
      const isMember = dao.members.map(String).includes(ic.caller().toString());
      if (!isMember) {
        return Result.Err<Proposal[], string>(`You don't belong to this dao.`);
      }

      const proposals = proposalStorage.values();
      const returnedProposals: Proposal[] = [];

      for (const proposal of proposals) {
        if (proposal.daoId === daoId) {
          returnedProposals.push(proposal); // Filter proposals for that dao only
        }
      }

      return Result.Ok<Proposal[], string>(returnedProposals);
    },
    None: () => {
      return Result.Err<Proposal[], string>(
        `A dao with id=${daoId} was not found.`
      );
    },
  });
}

$update;
// Delete a proposal by its ID
export function deleteProposal(id: string): Result<Proposal, string> {
  return match(proposalStorage.get(id), {
    Some: (proposal: Proposal) => {
      if (proposal.owner.toString() !== ic.caller().toString()) {
        return Result.Err<Proposal, string>(
          `You are not authorized to delete the proposal.`
        );
      }

      proposalStorage.remove(id); // Remove the proposal from the storage
      return Result.Ok<Proposal, string>(proposal);
    },
    None: () => {
      return Result.Err<Proposal, string>(
        `Couldn't delete a proposal with id=${id}. Proposal not found.`
      );
    },
  });
}

globalThis.crypto = {
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
