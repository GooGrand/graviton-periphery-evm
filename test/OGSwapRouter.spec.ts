import chai, { expect } from 'chai'
import { waffle, ethers } from "hardhat"
import { Contract, BigNumber, constants, utils } from 'ethers'
const { MaxUint256 } = constants
import { solidity, createFixtureLoader } from 'ethereum-waffle'

import { expandTo18Decimals, mineBlock, bigNumberify, hexToBytes } from './shared/utilities'
import { ogFixture } from './shared/fixtures'
import { OgSwapRouter, OGRouterEventEmitter } from '../typechain'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('OGSwapRouter', () => {
  const provider = ethers.provider
  const [wallet, provisor, bob, alice] = waffle.provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, provisor], waffle.provider)

  let token0: Contract
  let token1: Contract
  let WETH: Contract
  let gton: Contract
  let factory: Contract
  let router: OgSwapRouter
  let routerEventEmitter: Contract
  let ERC20Pair: Contract
  let WETHPair: Contract
  let pair: Contract
  let chainType = 0 
  let bscChainId = 56
  let ftmChainId = 250
  let receiveTokenAddress: number[]
  let customPayload:number[]
  beforeEach(async function () {
    const fixture = await loadFixture(ogFixture)
    token0 = fixture.token0
    token1 = fixture.token1
    WETH = fixture.WETH
    gton = fixture.gton
    factory = fixture.factoryV2
    router = fixture.router
    pair = fixture.pair
    WETHPair = fixture.WETHPair
    ERC20Pair = fixture.ERC20Pair
    routerEventEmitter = fixture.routerEventEmitter

    receiveTokenAddress = hexToBytes(token0.address.substring(2))
    customPayload = hexToBytes(alice.address.substring(2)).concat(receiveTokenAddress)
  })

  describe("", () => {
    it('factory, WETH', async () => {
      expect(await router.factory()).to.eq(factory.address)
      expect(await router.provisor()).to.eq(provisor.address)
      expect(await router.owner()).to.eq(wallet.address)
      expect(await router.gtonToken()).to.eq(gton.address)
      expect(await router.revertFlag()).to.eq(false)
      expect(await router.eth()).to.eq(WETH.address)
    })

    async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
      await token0.transfer(ERC20Pair.address, token0Amount)
      await gton.transfer(ERC20Pair.address, token1Amount)
      await ERC20Pair.mint(wallet.address, overrides)
    }

    describe('crossChain', () => {
      const token0Amount = expandTo18Decimals(5)
      const token1Amount = expandTo18Decimals(10)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = bigNumberify('1666666666666666666')

      beforeEach(async () => {
        await addLiquidity(token0Amount, token1Amount)
        await token0.approve(router.address, MaxUint256)
      })

      it('happy path', async () => {
        const payload = utils.solidityPack(["uint","uint","uint","uint","bytes"], 
        [(await provider.getBlock('latest')).number + 1,chainType,bscChainId,expectedOutputAmount,customPayload])
        await expect(
          router.crossChain(
            chainType,
            bscChainId,
            swapAmount,
            0,
            [token0.address, gton.address],
            customPayload,
            overrides
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(wallet.address, ERC20Pair.address, swapAmount)
          .to.emit(gton, 'Transfer')
          .withArgs(ERC20Pair.address, router.address, expectedOutputAmount)
          .to.emit(ERC20Pair, 'Sync')
          .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
          .to.emit(ERC20Pair, 'Swap')
          .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, router.address)
          .to.emit(router, "CrossChainInput")
          .withArgs(
            wallet.address, 
            token0.address,
            chainType,
            bscChainId, 
            expectedOutputAmount, 
            swapAmount
          )
          .to.emit(router, "PayloadMeta")
          .withArgs(
            expectedOutputAmount, 
            chainType,
            bscChainId, 
          )
          .to.emit(router, "Payload")
          .withArgs(
            payload
          )
      })

      // it('amounts', async () => {
      //   await token0.approve(routerEventEmitter.address, MaxUint256)
      //   await expect(
      //     routerEventEmitter.crossChain(
      //       router.address,
      //       chainType,
      //       bscChainId,
      //       swapAmount,
      //       0,
      //       [token0.address, gton.address],
      //       customPayload,
      //       overrides
      //     )
      //   )
      //     .to.emit(routerEventEmitter, 'Amounts')
      //     .withArgs([swapAmount, expectedOutputAmount])
      // })

      it('gas', async () => {
        // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        await ERC20Pair.sync(overrides)

        await token0.approve(router.address, MaxUint256)
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        const tx = await router.crossChain(
          chainType,
          bscChainId,
          swapAmount,
          0,
          [token0.address, gton.address],
          customPayload,
          overrides
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(147279)
      }).retries(3)
    })

    describe('crossChainfromGton', () => {
      const gtonAmount = expandTo18Decimals(5)

      beforeEach(async () => {
        await addLiquidity(expandTo18Decimals(5), expandTo18Decimals(15))
        await gton.approve(router.address, gtonAmount)
      })

      it('happy path', async () => {
        const payload = utils.solidityPack(["uint","uint","uint","uint","bytes"], 
        [(await provider.getBlock('latest')).number + 1,chainType,bscChainId,gtonAmount,customPayload])
        await expect(
          router.crossChainFromGton(
            chainType,
            bscChainId,
            gtonAmount,
            customPayload,
            overrides
          )
        )
          .to.emit(router, "CrossChainInput")
          .withArgs(
            wallet.address, 
            gton.address,
            chainType,
            bscChainId, 
            gtonAmount, 
            gtonAmount
          )
          .to.emit(router, "PayloadMeta")
          .withArgs(
            gtonAmount, 
            chainType,
            bscChainId, 
          )
          .to.emit(router, "Payload")
          .withArgs(
            payload
          )
      })

      // it('amounts', async () => {
      //   await token0.approve(routerEventEmitter.address, MaxUint256)
      //   await expect(
      //     routerEventEmitter.crossChain(
      //       router.address,
      //       chainType,
      //       bscChainId,
      //       swapAmount,
      //       0,
      //       [token0.address, gton.address],
      //       customPayload,
      //       overrides
      //     )
      //   )
      //     .to.emit(routerEventEmitter, 'Amounts')
      //     .withArgs([swapAmount, expectedOutputAmount])
      // })

      it('gas', async () => {
        // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        await ERC20Pair.sync(overrides)

        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        const tx = await router.crossChainFromGton(
          chainType,
          bscChainId,
          gtonAmount,
          customPayload,
          overrides
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(70402)
      }).retries(3)
    })

    describe('crossChainFromEth', () => {
      const gtonAmount = expandTo18Decimals(10)
      const ETHAmount = expandTo18Decimals(5)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = bigNumberify('1666666666666666666')

      beforeEach(async () => {
        await gton.transfer(WETHPair.address, gtonAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(wallet.address, overrides)

        await token0.approve(router.address, MaxUint256)
      })

      it('happy path', async () => {
        const payload = utils.solidityPack(["uint","uint","uint","uint","bytes"], 
          [(await provider.getBlock('latest')).number + 1,chainType,bscChainId,expectedOutputAmount,customPayload])
        const WETHPairToken0 = await WETHPair.token0()
        await expect(
          router.crossChainFromEth(chainType,
            bscChainId, 0, [WETH.address, gton.address], customPayload, {
            ...overrides,
            value: swapAmount
          })
        )
          .to.emit(WETH, 'Transfer')
          .withArgs(router.address, WETHPair.address, swapAmount)
          .to.emit(gton, 'Transfer')
          .withArgs(WETHPair.address, router.address, expectedOutputAmount)
          .to.emit(WETHPair, 'Sync')
          .withArgs(
            WETHPairToken0 === gton.address
              ? gtonAmount.sub(expectedOutputAmount)
              : ETHAmount.add(swapAmount),
            WETHPairToken0 === gton.address
              ? ETHAmount.add(swapAmount)
              : gtonAmount.sub(expectedOutputAmount)
          )
          .to.emit(WETHPair, 'Swap')
          .withArgs(
            router.address,
            WETHPairToken0 === gton.address ? 0 : swapAmount,
            WETHPairToken0 === gton.address ? swapAmount : 0,
            WETHPairToken0 === gton.address ? expectedOutputAmount : 0,
            WETHPairToken0 === gton.address ? 0 : expectedOutputAmount,
            router.address
          )
          .to.emit(router, "CrossChainInput")
          .withArgs(
            wallet.address, 
            WETH.address,
            chainType,
            bscChainId, 
            expectedOutputAmount, 
            swapAmount
          )
          .to.emit(router, "PayloadMeta")
          .withArgs(
            expectedOutputAmount, 
            chainType,
            bscChainId, 
          )
          .to.emit(router, "Payload")
          .withArgs(
            payload
          )
      })
      /**
       * there is the problem with event emitter currently
       * 
       */

      // it('amounts', async () => {
      //   await expect(
      //     routerEventEmitter.crossChainFromEth(
      //       router.address,
      //       chainType,
      //       bscChainId, 
      //       0,
      //       [WETH.address, gton.address],
      //       customPayload,
      //       {
      //         ...overrides,
      //         value: swapAmount
      //       }
      //     )
      //   )
      //     .to.emit(router, 'Amounts')
      //     .withArgs([swapAmount, expectedOutputAmount])
      // })

      it('gas', async () => {
        const gtonAmount = expandTo18Decimals(10)
        const ETHAmount = expandTo18Decimals(5)
        await gton.transfer(WETHPair.address, gtonAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(wallet.address, overrides)

        // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        await ERC20Pair.sync(overrides)

        const swapAmount = expandTo18Decimals(1)
        await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
        const tx = await router.crossChainFromEth(
          chainType,
          bscChainId, 
          0,
          [WETH.address, gton.address],
          customPayload,
          {
            ...overrides,
            value: swapAmount
          }
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(153171)
      }).retries(3)
    })
  })
})
