import logger from "../logger"

import { HYPER_FUNC_NAME, PUBLIC_API_ROOT_URL } from "../globals"
import { callHyperFunction } from "../runner/hyper-api"

import { DangerfileReferenceString } from "../db/index"

import { getTemporaryAccessTokenForInstallation } from "../api/github"
import { RunType } from "../danger/danger_run"
import { InstallationToRun, Payload } from "../danger/danger_runner"
import { createPerilSandboxAPIJWT } from "./sandbox/jwt"

// Sidenote: auth token is in  dsl.settings.github
export interface PerilRunnerBootstrapJSON {
  /** The DSL for JSON, could be a DangerDSLJSON type or the raw webhook */
  payload: Payload
  /** The reference for the initial dangerfile */
  paths: DangerfileReferenceString[]
  /** Installation number */
  installation: InstallationToRun
  /** DSL type */
  dslType: "pr" | "run"
  /** A short-lived JWT that can be used to make API requests back to Peril */
  perilJWT: string
  /** The root address of the Peril server */
  perilAPIRoot: string
  /** Optional Peril settings? (think like task) */
  // TODO: Make a PerilJSONDSL
  peril: any
  // TODO: Generate a UUID and then sign with JWT for security?
}

// You can fake this by doing something like:
//
// cat source/runner/fixtures/branch-push.json | sed 's/12345/'"$DANGER_GITHUB_API_TOKEN"'/' | hyper func call danger-peril-staging
//

/** This function is used inside Peril */
export const triggerSandboxDangerRun = async (
  type: RunType,
  installation: InstallationToRun,
  paths: DangerfileReferenceString[],
  payload: Payload,
  peril: any
) => {
  const token = await getTemporaryAccessTokenForInstallation(installation.iID)

  // Ensure that the settings are passed through correctly
  const DSL: any = payload.dsl || {}
  DSL.settings = {
    github: {
      accessToken: token,
      baseURL: undefined, // used for GH Enterprise, not supported today
      additionalHeaders: { Accept: "application/vnd.github.machine-man-preview+json" },
    },
    cliArgs: {} as any,
  }

  payload.dsl = DSL

  const stdOUT: PerilRunnerBootstrapJSON = {
    installation,
    payload,
    dslType: type === RunType.pr ? "pr" : "run",
    peril,
    perilJWT: createPerilSandboxAPIJWT(installation.iID, ["scheduleTasks"]),
    perilAPIRoot: PUBLIC_API_ROOT_URL,
    paths,
  }

  const call = await callHyperFunction(stdOUT)
  const callID = JSON.parse(call).CallId
  if (callID) {
    logger.info(`   Logs: hyper func logs --tail=all --callid ${callID} ${HYPER_FUNC_NAME}`)
    logger.info(`         hyper func get ${callID}`)
  }
}
