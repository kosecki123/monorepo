import { Operation, OperationProcessor } from "@ebryn/jsonapi-ts";
import { Log } from "logepi";

import Commitment from "./resource";

export default class CommitmentProcessor extends OperationProcessor<
  Commitment
> {
  public resourceClass = Commitment;

  public async update(op: Operation): Promise<Commitment> {
    Log.info("Received the commitment", {});

    return {} as Commitment;
  }
}
