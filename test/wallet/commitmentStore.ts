import { Context } from "../../src/state";
import {
	InternalMessage,
	Signature,
	ActionName,
	ClientActionMessage
} from "../../src/types";
import { getFirstResult, getLastResult } from "../../src/middleware/middleware";
import { Instruction } from "../../src/instructions";
import {
	CfOperation,
	Transaction
} from "../../src/middleware/cf-operation/types";

interface Commitments {
	appId: string;
	commitments: Map<ActionName, Transaction>;
	addCommitment(
		action: ActionName,
		cfOperation: CfOperation,
		signatures: Array<Signature>
	);

	hasCommitment(action: ActionName);
	getTransaction(action: ActionName);
}

// NOTE: this can't actually be used until we setup the Registry and the Multisig
// wallets for the tests to use

/**
 * AppCommitment holds the Commitments for install, update, and uninstall of apps
 * which by definition includes the signatures over the operation
 * Refer to: https://github.com/counterfactual/machine/blob/master/specs/counterfactual-protocols.md#commitments
 */
export class AppCommitments implements Commitments {
	readonly appId: string;
	readonly commitments: Map<ActionName, Transaction>;

	constructor(appId: string) {
		this.appId = appId;
		this.commitments = new Map();
	}

	/**
	 * Adds a commitment for some action on this app.
	 * @param action
	 * @param cfOperation
	 * @param signatures
	 */
	addCommitment(
		action: ActionName,
		cfOperation: CfOperation,
		signatures: Array<Signature>
	) {
		const commitment = cfOperation.transaction(signatures);
		if (action !== ActionName.UPDATE && this.commitments.has(action)) {
			return;
			// FIXME: we should never non-maliciously get to this state
			// throw Error("Can't reset setup/install/uninstall commitments");
		}
		this.commitments.set(action, commitment);
	}

	/**
	 * Determines whether a given action's commitment has been set
	 * @param action
	 */
	hasCommitment(action: ActionName): boolean {
		return this.commitments.has(action);
	}

	/**
	 * Gets an action's commitment for this app
	 * @param action
	 */
	getTransaction(action: ActionName): Transaction {
		if (this.commitments.has(action)) {
			return this.commitments.get(action)!;
		}
		throw Error(
			"App ID: " + this.appId + " has no " + ActionName[action] + " commitment"
		);
	}
}

/**
 * The store is a mapping of appId to the three types of actions for an app:
 * - install
 * - update
 * - uninstall
 * Each action has a cf operation which encapsulates both the actual
 * operation and the data that's being operated on.
 */
export class CommitmentStore {
	// TODO: provide an actual backend db for this later
	public store: Map<string, AppCommitments>;

	constructor() {
		this.store = new Map();
	}

	/**
	 * Sets the commitment at the end of a protocol's execution.
	 * @param internalMessage
	 * @param next
	 * @param context
	 * @throws Error if the counterparty's signature is not set
	 */
	setCommitment(
		internalMessage: InternalMessage,
		next: Function,
		context: Context
	) {
		let appId;
		const action: ActionName = internalMessage.actionName;
		const op = getFirstResult(Instruction.OP_GENERATE, context.results).value;
		let appCommitments: AppCommitments;

		let incomingMessage = this.incomingMessage(internalMessage, context);

		if (action === ActionName.SETUP) {
			appId = internalMessage.clientMessage.multisigAddress;
		} else if (action === ActionName.INSTALL) {
			let proposal = getFirstResult(
				Instruction.STATE_TRANSITION_PROPOSE,
				context.results
			).value;
			appId = proposal.cfAddr;
		} else {
			appId = internalMessage.clientMessage.appId;
		}

		if (!this.store.has(appId)) {
			appCommitments = new AppCommitments(appId);
			this.store.set(appId, appCommitments);
		} else {
			appCommitments = this.store.get(appId)!;
		}

		const signature: Signature = getFirstResult(
			Instruction.OP_SIGN,
			context.results
		).value;

		if (incomingMessage === undefined) {
			console.log("undefined results = ", context.results);
		}
		let counterpartySignature = incomingMessage!.signature;
		if (
			counterpartySignature === undefined ||
			signature.toString() === counterpartySignature.toString()
		) {
			// FIXME: these errors should be handled more gracefully
			throw Error(
				"Cannot make commitment for operation: " +
					action +
					". The counterparty hasn't signed the commitment"
			);
		}

		appCommitments.addCommitment(action, op, [
			signature,
			counterpartySignature
		]);
		next();
	}

	/**
	 * Returns the last message sent from my peer.
	 */
	incomingMessage(
		internalMessage: InternalMessage,
		context: Context
	): ClientActionMessage | null {
		if (internalMessage.actionName === ActionName.INSTALL) {
			return getLastResult(Instruction.IO_WAIT, context.results).value;
		} else {
			const incomingMessageResult = getLastResult(
				Instruction.IO_WAIT,
				context.results
			);
			if (JSON.stringify(incomingMessageResult) === JSON.stringify({})) {
				// receiver since non installs should have no io_WAIT
				return internalMessage.clientMessage;
			} else {
				// sender so grab out the response
				return incomingMessageResult.value;
			}
		}
	}

	/**
	 * Given an app ID, returns the signed transaction representing the action
	 * operating over the specified app.
	 * @param appId
	 * @param action
	 * @throws Error If appId doesn't exist in the store
	 * @throws Error if action doesn't exist for the app
	 */
	getTransaction(appId: string, action: ActionName): Transaction {
		if (!this.store.has(appId)) {
			console.error("appid = ", appId);
			console.error("store = ", this.store);
			throw Error("Invalid app id");
		}
		const appCommitments = this.store.get(appId);
		console.log("store ===", this.store);
		console.log("commitments ====", appCommitments);
		return appCommitments!.getTransaction(action);
	}

	appCount(): number {
		return this.store.size;
	}

	appExists(appId: string): boolean {
		return this.store.has(appId);
	}

	appHasCommitment(appId: string, action: ActionName): boolean {
		return (
			this.store.has(appId) && this.store.get(appId)!.hasCommitment(action)
		);
	}
}