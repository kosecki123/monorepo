import { Application, jsonApiKoa } from "@ebryn/jsonapi-ts";
import cors from "@koa/cors";
import Koa from "koa";
import { KoaLoggingMiddleware as logs } from "logepi";

import CommitmentProcessor from "./resources/commitment/processor";
import CommitmentResource from "./resources/commitment/resource";

export default function mountApi() {
  const app = new Application({
    namespace: "api",
    types: [CommitmentResource],
    processors: [new CommitmentProcessor()]
  });

  const api = new Koa();

  api
    .use(cors({ keepHeadersOnError: false }))
    .use(jsonApiKoa(app))
    .use(logs());

  return api;
}
