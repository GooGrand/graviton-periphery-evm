//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "./interfaces/IERC20.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IOgSwapRouter.sol";
import './libraries/UniswapV2Library.sol';

contract OgSwapRouter is IOgSwapRouter {
    IWETH public eth;
    IERC20 public gtonToken;
    address public factory;
    address public provisor;
    address public owner;
    bool public revertFlag;
        
    mapping (bytes => bool) public processedData;
    uint public fee;
    
    modifier onlyOwner() {
        require(msg.sender==owner,'NOT_PERMITED');
        _;
    }
    
    modifier notReverted() {
        require(!revertFlag,'NOT_PERMITED');
        _;
    }
    
    receive() external payable {
        require(msg.sender == address(eth)); // only accept ETH via fallback from the WETH contract
    }
    
    constructor (
        address _factory,
        address _owner,
        address _provisor,
        address _gtonToken,
        address _weth
    ) {
        gtonToken = IERC20(_gtonToken);
        factory = _factory;
        provisor = _provisor;
        owner = _owner;
        eth = IWETH(_weth);
        revertFlag = false;
    }
    
    function setOwner(address _owner) public onlyOwner {
        owner = _owner;
    }
    
    function toggleRevert() public onlyOwner {
        revertFlag = !revertFlag;
    }
    
    function emergencyTokenTransfer(
        address _token,
        address _user,
        uint _amount
    ) public override onlyOwner {
        require(IERC20(_token).transfer(_user,_amount),"INSUFFICIENT_CONTRACT_BALANCE");
    }
    
    function deserializeUint(
        bytes memory b,
        uint256 startPos,
        uint256 len
    ) public pure returns (uint256) {
        uint256 v = 0;
        for (uint256 p = startPos; p < startPos + len; p++) {
            v = v * 256 + uint256(uint8(b[p]));
        }
        return v;
    }

    function deserializeAddress(bytes memory b, uint256 startPos)
        public
        pure
        returns (address)
    {
        return address(uint160(deserializeUint(b, startPos, 20)));
    }
    
    function setFee(uint _fee) public override onlyOwner {
        fee = _fee;
    }
    
    function setProvisor(address _provisor) public override onlyOwner {
        provisor = _provisor;
    }
    
    function _swap(uint[] memory amounts, address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = UniswapV2Library.sortTokens(input, output);
            uint amountOut = amounts[i + 1];
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
            address to = i < path.length - 2 ? UniswapV2Library.pairFor(address(factory), output, path[i + 2]) : _to;
            IUniswapV2Pair(UniswapV2Library.pairFor(address(factory), input, output)).swap(
                amount0Out, amount1Out, to, new bytes(0)
            );
        }
    }
    
    function crossChainFromEth (
        uint chainType,
        uint chainId,
        uint _minimalAmountOut,
        address[] memory path,
        bytes memory customPayload
    ) public override payable returns (uint[] memory amounts) {
        require(path[0]==address(eth) && path[path.length-1]==address(gtonToken),'PATH_SHOULD_START_WITH_WETH');
        amounts = UniswapV2Library.getAmountsOut(factory, msg.value, path);
        require(_minimalAmountOut <= amounts[amounts.length-1], 'INSUFFICIENT_OUTPUT_AMOUNT');
        eth.deposit{value: amounts[0]}();
        require(eth.transfer(UniswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, address(this));
        
        bytes memory payload = abi.encodePacked(block.number,chainType,chainId,amounts[amounts.length-1],customPayload);
        emit CrossChainInput(msg.sender, address(eth), chainType, chainId, amounts[amounts.length-1], msg.value);
        emit PayloadMeta(amounts[amounts.length-1],chainType,chainId);
        emit Payload(payload);
    }
    
    function crossChain (
        uint chainType,
        uint chainId,
        uint _amountTokenIn,
        uint _minimalAmountOut,
        address[] memory path,
        bytes memory customPayload
    ) public payable override returns (uint[] memory amounts) {
        require(path[path.length-1]==address(gtonToken),'PATH_SHOULD_END_WITH_GTON');
        amounts = UniswapV2Library.getAmountsOut(factory, _amountTokenIn, path);
        require(_minimalAmountOut <= amounts[amounts.length-1], 'INSUFFICIENT_OUTPUT_AMOUNT');
        require(IERC20(path[0]).transferFrom(
            msg.sender,
            UniswapV2Library.pairFor(factory, path[0], path[1]), 
            amounts[0]
        ),"INSUFFICIENT_ALLOWANCE_AMOUNT");
        _swap(amounts, path, address(this));

        bytes memory payload = abi.encodePacked(block.number,chainType,chainId,amounts[amounts.length-1],customPayload);
        emit CrossChainInput(msg.sender, path[0], chainType, chainId, amounts[amounts.length-1], _amountTokenIn);
        emit PayloadMeta(amounts[amounts.length-1],chainType,chainId);
        emit Payload(payload);
    }
    
    function crossChainFromGton (
        uint chainType,
        uint chainId,
        uint _amountTokenIn,
        bytes memory customPayload
    ) public override {
        require(IERC20(gtonToken).transferFrom(msg.sender,address(this),_amountTokenIn),"");
        bytes memory payload = abi.encodePacked(block.number,chainType,chainId,_amountTokenIn,customPayload);
        
        emit CrossChainInput(msg.sender, address(gtonToken), chainType, chainId, _amountTokenIn, _amountTokenIn);
        emit PayloadMeta(_amountTokenIn,chainType,chainId);
        emit Payload(payload);
    }
    
    function recv (
        bytes calldata payload
    ) external override payable {
        require(msg.sender == address(provisor),"NOT_PROVISOR");
        require(!processedData[payload],"DATA_ALREADY_PROCESSED");
        processedData[payload] = true;
        
        uint chainFromType = deserializeUint(payload,32,32);
        uint chainFromId = deserializeUint(payload,32*2,32);

        uint gtonAmount = deserializeUint(payload,32*3,32) - fee;
        address payable receiver = payable(deserializeAddress(payload,32*4));
        if (payload.length > 32*5) {
            address tokenTo = deserializeAddress(payload,32*4+20);
            address[] memory path = new address[](2);
            path[0] = address(gtonToken);
            path[1] = tokenTo;
            uint[] memory amounts = UniswapV2Library.getAmountsOut(factory, gtonAmount-fee, path);

            require(gtonToken.transfer(UniswapV2Library.pairFor(factory, path[0], path[1]),
                gtonAmount),"INSUFFICIENT_CONTRACT_BALANCE");
            _swap(amounts, path, address(this));
            
            emit CrossChainOutput(receiver, tokenTo, chainFromType, chainFromId, amounts[1], gtonAmount);
            if (tokenTo == address(eth)) {
                eth.withdraw(amounts[amounts.length-1]);
                require(receiver.send(amounts[amounts.length-1]),'INSUFFICIENT_CONTRACT_ETH_BALANCE');
            } else {
                require(IERC20(tokenTo).transfer(receiver,amounts[amounts.length-1]),"INSUFFICIENT_CONTRACT_BALANCE");
            }
            return;
        }
        emit CrossChainOutput(receiver, address(gtonToken), chainFromType, chainFromId, gtonAmount, gtonAmount);
        require(gtonToken.transfer(receiver,gtonAmount),"INSUFFICIENT_CONTRACT_BALANCE");  
    }
}