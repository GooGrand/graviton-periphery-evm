//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IOgSwapRouter {
    event Swap(
        address indexed from, 
        address to, 
        address indexed tokenFrom, 
        address indexed tokenTo,
        uint amountIn, 
        uint amountGton, 
        uint amountOut
    );
    event CrossChainInput(
        address indexed from, 
        address indexed tokenFrom,
        uint chainId, 
        uint chainType, 
        uint gton,
        uint amount
    );
    event PayloadMeta(
        uint indexed amount, 
        uint indexed chainType, 
        uint indexed chainId
    );
    event Payload(
        bytes payload
    );
    event CrossChainOutput(
        address indexed to, 
        address indexed tokenTo, 
        uint chainFromType, 
        uint chainFromId, 
        uint amountOut, 
        uint gtonAmount
    );

    function emergencyTokenTransfer(
        address _token,
        address _user,
        uint _amount
        
    ) external;
    
    function setFee(uint _fee) external;
    
    function setProvisor(address _provisor) external;
    
    function tokenWithdraw(uint _amount, address _token, address _user) external;

    
    function crossChainFromEth (
        uint chainType,
        uint chainId,
        uint _minimalAmountOut,
        address[] memory path,
        bytes memory customPayload
    ) external payable returns (uint[] memory amounts);
    
    function crossChain (
        uint chainType,
        uint chainId,
        uint _amountTokenIn,
        uint _minimalAmountOut,
        address[] memory path,
        bytes memory customPayload
    ) external payable returns (uint[] memory amounts);
    
    function crossChainFromGton (
        uint chainType,
        uint chainId,
        uint _amountTokenIn,
        bytes memory customPayload
    ) external;
    
    function recv (
        bytes calldata payload
    ) external payable;
}