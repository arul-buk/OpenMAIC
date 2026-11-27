import { Container, getContainer } from "@cloudflare/containers";

export interface Env {
  OPENMAIC_CONTAINER: DurableObjectNamespace<OpenMAICContainer>;
  DATABASE_URL: string;
  GOOGLE_API_KEY: string;
  ACCESS_CODE: string;
  OPENMAIC_SECRET_KEY: string;
  OWNER_SINGLE_USER_ID: string;
}

export class OpenMAICContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = "15m";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      PORT: "3000",
      OPENMAIC_CONFIG: "/app/openmaic.yml",
      OWNER_SINGLE_USER: "true",
      DATABASE_URL: env.DATABASE_URL,
      GOOGLE_API_KEY: env.GOOGLE_API_KEY,
      ACCESS_CODE: env.ACCESS_CODE,
      OPENMAIC_SECRET_KEY: env.OPENMAIC_SECRET_KEY,
      OWNER_SINGLE_USER_ID: env.OWNER_SINGLE_USER_ID,
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(env.OPENMAIC_CONTAINER, "main");
    return container.fetch(request);
  },
};
