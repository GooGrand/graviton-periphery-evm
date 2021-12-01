pragma solidity >=0.8.0;

import '../interfaces/IOgSwapRouter.sol';

contract OGRouterEventEmitter {
    event Amounts(uint[] amounts);

    receive() external payable {}

    function crossChain(
        address router,
        uint chainType,
        uint chainId,
        uint _amountTokenIn,
        uint _minimalAmountOut,
        address[] memory path,
        bytes memory customPayload
    ) external {
        (bool success, bytes memory returnData) = router.delegatecall(abi.encodeWithSelector(
            IOgSwapRouter(router).crossChain.selector, chainType, chainId, 
            _amountTokenIn, _minimalAmountOut, path, customPayload
        ));
        assert(success);
        emit Amounts(abi.decode(returnData, (uint[])));
    }

    function crossChainFromEth(
        address router,
        uint chainType,
        uint chainId,
        uint _minimalAmountOut,
        address[] memory path,
        bytes memory customPayload
    ) external payable {
        (bool success, bytes memory returnData) = router.delegatecall(abi.encodeWithSelector(
            IOgSwapRouter(router).crossChainFromEth.selector, chainType, chainId, 
            _minimalAmountOut, path, customPayload
        ));
        assert(success);
        emit Amounts(abi.decode(returnData, (uint[])));
    }
}
