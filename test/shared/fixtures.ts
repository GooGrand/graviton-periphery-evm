import { ethers } from "hardhat"
import { Wallet, Contract } from 'ethers'

import { expandTo18Decimals, getFactory } from './utilities'

import { UniswapV2Factory } from '../../graviton-core-evm/typechain/UniswapV2Factory'
import { UniswapV2Factory__factory as factoryMeta } from "../../graviton-core-evm/typechain/factories/UniswapV2Factory__factory"
import { IUniswapV2Pair__factory as pairFactory } from '../../graviton-core-evm/typechain/factories/IUniswapV2Pair__factory'

import { ERC20 } from '../../typechain/ERC20'
import { WETH9 } from '../../typechain/WETH9'
import { UniswapV2Router01 } from '../../typechain/UniswapV2Router01'
import { UniswapV2Router02 } from '../../typechain/UniswapV2Router02'
import { RouterEventEmitter } from '../../typechain/RouterEventEmitter'
import { OGRouterEventEmitter, OgSwapRouter } from "../../typechain"

const overrides = {
  gasLimit: 9999999
}

interface V2Fixture {
  token0: Contract
  token1: Contract
  WETH: Contract
  WETHPartner: Contract
  factoryV2: Contract
  router01: Contract
  router02: Contract
  routerEventEmitter: Contract
  router: Contract
  // migrator: Contract
  pair: Contract
  WETHPair: Contract
  ERC20Pair: Contract
}

export async function v2Fixture([wallet]: Wallet[], provider: any): Promise<V2Fixture> {
  const tokenFactory = await ethers.getContractFactory("ERC20")
  const wethFactory = await ethers.getContractFactory("WETH9")
  const tokenA = (await tokenFactory.deploy(
    expandTo18Decimals(10000)
  )) as ERC20
  const tokenB = (await tokenFactory.deploy(
    expandTo18Decimals(10000)
  )) as ERC20
  const WETHPartner = (await tokenFactory.deploy(
    expandTo18Decimals(10000)
  )) as ERC20
  const WETH = (await wethFactory.deploy()) as WETH9

  // deploy V2
  const factoryFactory = await getFactory(factoryMeta)
  const factoryV2 = (await factoryFactory.deploy(
    wallet.address
  )) as UniswapV2Factory

  // deploy routers
  const router01Factory = await ethers.getContractFactory("UniswapV2Router01")
  const router02Factory = await ethers.getContractFactory("UniswapV2Router02")

  const router01 = (await router01Factory.deploy(
    factoryV2.address, WETH.address, overrides
  )) as UniswapV2Router01
  const router02 = (await router02Factory.deploy(
    factoryV2.address, WETH.address, overrides
  )) as UniswapV2Router02

  // event emitter for testing
  const eventEmitterFactory = await ethers.getContractFactory("RouterEventEmitter")
  const routerEventEmitter = (await eventEmitterFactory.deploy()) as RouterEventEmitter

  // deploy migrator
  // const migratorFactory = await ethers.getContractFactory("UniswapV2Migrator")

  // const migrator = (await migratorFactory.deploy(factoryV1.address, router01.address)) as UniswapV2Migrator

  // initialize V2
  await factoryV2.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(pairFactory.abi), provider).connect(wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  await factoryV2.createPair(WETH.address, WETHPartner.address)
  const WETHPairAddress = await factoryV2.getPair(WETH.address, WETHPartner.address)
  const WETHPair = new Contract(WETHPairAddress, JSON.stringify(pairFactory.abi), provider).connect(wallet)

  await factoryV2.createPair(token0.address, WETHPartner.address)
  const erc20Pair = await factoryV2.getPair(token0.address, WETHPartner.address)
  const ERC20Pair = new Contract(erc20Pair, JSON.stringify(pairFactory.abi), provider).connect(wallet)

  return {
    token0,
    token1,
    WETH,
    WETHPartner,
    factoryV2,
    router01,
    router02,
    router: router02, // the default router, 01 had a minor bug
    routerEventEmitter,
    // migrator,
    pair,
    WETHPair,
    ERC20Pair
  }
}

interface OgFixture {
  token0: Contract
  token1: Contract
  WETH: Contract
  gton: Contract
  factoryV2: Contract
  router: OgSwapRouter
  pair: Contract
  WETHPair: Contract
  ERC20Pair: Contract
  routerEventEmitter: Contract
}
export async function ogFixture([wallet, provisor]: Wallet[], provider: any): Promise<OgFixture> {
  const { token0, token1, WETH, WETHPartner, factoryV2, pair, WETHPair, ERC20Pair } = await v2Fixture([wallet], provider)
  const swapFactory = await ethers.getContractFactory("OgSwapRouter")
  const router = await swapFactory.deploy(factoryV2.address, wallet.address, provisor.address, WETHPartner.address, WETH.address)
  const eventEmitterFactory = await ethers.getContractFactory("OGRouterEventEmitter")
  const routerEventEmitter = await eventEmitterFactory.deploy()
  return {
    token0, token1, WETH, gton: WETHPartner, factoryV2, pair, WETHPair, router, routerEventEmitter, ERC20Pair
  }
}
