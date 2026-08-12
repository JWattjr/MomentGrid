import { handleTypes } from '@inco/lightning-js'
import { Lightning } from '@inco/lightning-js/lite'
import { packGrid, PredictionId } from '@moment-grid/scoring'
import { Address, Hex } from 'viem'

export type EncryptGridOptions = {
  grid: PredictionId[]
  accountAddress: Address
  gridStoreAddress: Address
  rpcUrl?: string
}

export async function encryptGrid({
  grid,
  accountAddress,
  gridStoreAddress,
  rpcUrl,
}: EncryptGridOptions): Promise<Hex> {
  try {
    const lightning = await Lightning.baseSepoliaTestnet({
      hostChainRpcUrls: rpcUrl ? [rpcUrl] : undefined,
    })
    return (await lightning.encrypt(packGrid(grid), {
      accountAddress,
      dappAddress: gridStoreAddress,
      handleType: handleTypes.euint256,
    })) as Hex
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    throw new Error(`Could not encrypt the grid for Inco Lightning: ${reason}`)
  }
}
