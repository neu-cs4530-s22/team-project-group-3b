import assert from 'assert';
import { Socket } from 'socket.io';
import Player, { SongData } from '../types/Player';
import { ChatMessage, CoveyTownList, UserLocation } from '../CoveyTypes';
import CoveyTownListener from '../types/CoveyTownListener';
import CoveyTownsStore from '../lib/CoveyTownsStore';
import { ConversationAreaCreateRequest, ServerConversationArea } from '../client/TownsServiceClient';
import SpotifyClient from '../lib/SpotifyClient';

/**
 * The format of a request to join a Town in Covey.Town, as dispatched by the server middleware
 */
export interface TownJoinRequest {
  /** userName of the player that would like to join * */
  userName: string;
  /** ID of the town that the player would like to join * */
  coveyTownID: string;
  /** Spotify session token of the player that would like to join */
  spotifySessionToken?: string;
}

/**
 * The format of a response to join a Town in Covey.Town, as returned by the handler to the server
 * middleware
 */
export interface TownJoinResponse {
  /** Unique ID that represents this player * */
  coveyUserID: string;
  /** Secret token that this player should use to authenticate
   * in future requests to this service * */
  coveySessionToken: string;
  /** Secret token that this player should use to authenticate
   * in future requests to the video service * */
  providerVideoToken: string;
  /** List of players currently in this town * */
  currentPlayers: Player[];
  /** Friendly name of this town * */
  friendlyName: string;
  /** Is this a private town? * */
  isPubliclyListed: boolean;
  /** Conversation areas currently active in this town */
  conversationAreas: ServerConversationArea[];
}

/**
 * Payload sent by client to create a Town in Covey.Town
 */
export interface TownCreateRequest {
  friendlyName: string;
  isPubliclyListed: boolean;
}

/**
 * Response from the server for a Town create request
 */
export interface TownCreateResponse {
  coveyTownID: string;
  coveyTownPassword: string;
}

/**
 * Response from the server for a Town list request
 */
export interface TownListResponse {
  towns: CoveyTownList;
}

/**
 * Payload sent by the client to delete a Town
 */
export interface TownDeleteRequest {
  coveyTownID: string;
  coveyTownPassword: string;
}

/**
 * Payload sent by the client to update a Town.
 * N.B., JavaScript is terrible, so:
 * if(!isPubliclyListed) -> evaluates to true if the value is false OR undefined, use ===
 */
export interface TownUpdateRequest {
  coveyTownID: string;
  coveyTownPassword: string;
  friendlyName?: string;
  isPubliclyListed?: boolean;
}

/**
 * Envelope that wraps any response from the server
 */
export interface ResponseEnvelope<T> {
  isOK: boolean;
  message?: string;
  response?: T;
}

/**
 * A handler to process a player's request to join a town. The flow is:
 *  1. Client makes a TownJoinRequest, this handler is executed
 *  2. Client uses the sessionToken returned by this handler to make a subscription to the town,
 *  @see townSubscriptionHandler for the code that handles that request.
 *
 * @param requestData an object representing the player's request
 */
export async function townJoinHandler(requestData: TownJoinRequest): Promise<ResponseEnvelope<TownJoinResponse>> {
  const townsStore = CoveyTownsStore.getInstance();

  const coveyTownController = townsStore.getControllerForTown(requestData.coveyTownID);
  if (!coveyTownController) {
    return {
      isOK: false,
      message: 'Error: No such town',
    };
  }
  const newPlayer = new Player(requestData.userName);
  const newSession = await coveyTownController.addPlayer(newPlayer);
  
  if (requestData.spotifySessionToken) {
    // newSession.spotifyToken = requestData.spotifySessionToken;
    SpotifyClient.addTownPlayerToClient(requestData.coveyTownID, newPlayer, requestData.spotifySessionToken);
  }

  assert(newSession.videoToken);
  return {
    isOK: true,
    response: {
      coveyUserID: newPlayer.id,
      coveySessionToken: newSession.sessionToken,
      providerVideoToken: newSession.videoToken,
      currentPlayers: coveyTownController.players,
      friendlyName: coveyTownController.friendlyName,
      isPubliclyListed: coveyTownController.isPubliclyListed,
      conversationAreas: coveyTownController.conversationAreas,
    },
  };
}

export function townListHandler(): ResponseEnvelope<TownListResponse> {
  const townsStore = CoveyTownsStore.getInstance();
  return {
    isOK: true,
    response: { towns: townsStore.getTowns() },
  };
}

export function townCreateHandler(requestData: TownCreateRequest): ResponseEnvelope<TownCreateResponse> {
  const townsStore = CoveyTownsStore.getInstance();
  if (requestData.friendlyName.length === 0) {
    return {
      isOK: false,
      message: 'FriendlyName must be specified',
    };
  }
  const newTown = townsStore.createTown(requestData.friendlyName, requestData.isPubliclyListed);

  SpotifyClient.addTownToClient(newTown.coveyTownID);

  return {
    isOK: true,
    response: {
      coveyTownID: newTown.coveyTownID,
      coveyTownPassword: newTown.townUpdatePassword,
    },
  };
}

export function townDeleteHandler(requestData: TownDeleteRequest): ResponseEnvelope<Record<string, null>> {
  const townsStore = CoveyTownsStore.getInstance();
  const success = townsStore.deleteTown(requestData.coveyTownID, requestData.coveyTownPassword);

  SpotifyClient.removeTownFromClient(requestData.coveyTownID);

  return {
    isOK: success,
    response: {},
    message: !success ? 'Invalid password. Please double check your town update password.' : undefined,
  };
}

export function townUpdateHandler(requestData: TownUpdateRequest): ResponseEnvelope<Record<string, null>> {
  const townsStore = CoveyTownsStore.getInstance();
  const success = townsStore.updateTown(requestData.coveyTownID, requestData.coveyTownPassword, requestData.friendlyName, requestData.isPubliclyListed);
  return {
    isOK: success,
    response: {},
    message: !success ? 'Invalid password or update values specified. Please double check your town update password.' : undefined,
  };

}

/**
 * A handler to process the "Create Conversation Area" request
 * The intended flow of this handler is:
 * * Fetch the town controller for the specified town ID
 * * Validate that the sessionToken is valid for that town
 * * Ask the TownController to create the conversation area
 * @param _requestData Conversation area create request
 */
export function conversationAreaCreateHandler(_requestData: ConversationAreaCreateRequest) : ResponseEnvelope<Record<string, null>> {
  const townsStore = CoveyTownsStore.getInstance();
  const townController = townsStore.getControllerForTown(_requestData.coveyTownID);
  if (!townController?.getSessionByToken(_requestData.sessionToken)){
    return {
      isOK: false, response: {}, message: `Unable to create conversation area ${_requestData.conversationArea.label} with topic ${_requestData.conversationArea.topic}`,
    };
  }
  const success = townController.addConversationArea(_requestData.conversationArea);

  return {
    isOK: success,
    response: {},
    message: !success ? `Unable to create conversation area ${_requestData.conversationArea.label} with topic ${_requestData.conversationArea.topic}` : undefined,
  };
}

/**
 * An adapter between CoveyTownController's event interface (CoveyTownListener)
 * and the low-level network communication protocol
 *
 * @param socket the Socket object that we will use to communicate with the player
 */
function townSocketAdapter(socket: Socket): CoveyTownListener {
  return {
    onPlayerMoved(movedPlayer: Player) {
      socket.emit('playerMoved', movedPlayer);
    },
    onPlayerSongUpdated(updatedPlayer: Player) {
      socket.emit('playerSongUpdated', updatedPlayer);
    },
    onPlayerDisconnected(removedPlayer: Player) {
      socket.emit('playerDisconnect', removedPlayer);
    },
    onPlayerJoined(newPlayer: Player) {
      socket.emit('newPlayer', newPlayer);
    },
    onTownDestroyed() {
      socket.emit('townClosing');
      socket.disconnect(true);
    },
    onConversationAreaDestroyed(conversation: ServerConversationArea){
      socket.emit('conversationDestroyed', conversation);
    },
    onConversationAreaUpdated(conversation: ServerConversationArea){
      socket.emit('conversationUpdated', conversation);
    },
    onChatMessage(message: ChatMessage){
      socket.emit('chatMessage', message);
    },
  };
}

/**
 * A handler to process a remote player's subscription to updates for a town
 *
 * @param socket the Socket object that we will use to communicate with the player
 */
export async function townSubscriptionHandler(socket: Socket): Promise<void> {
  // Parse the client's session token from the connection
  // For each player, the session token should be the same string returned by joinTownHandler
  const { token, coveyTownID } = socket.handshake.auth as { token: string; coveyTownID: string };

  const townController = CoveyTownsStore.getInstance()
    .getControllerForTown(coveyTownID);

  // Retrieve our metadata about this player from the TownController
  const s = townController?.getSessionByToken(token);
  if (!s || !townController) {
    // No valid session exists for this token, hence this client's connection should be terminated
    socket.disconnect(true);
    return;
  }

  // Create an adapter that will translate events from the CoveyTownController into
  // events that the socket protocol knows about
  const listener = townSocketAdapter(socket);
  townController.addTownListener(listener);

  // Register an event listener for the client socket: if the client disconnects,
  // clean up our listener adapter, and then let the CoveyTownController know that the
  // player's session is disconnected
  socket.on('disconnect', () => {
    SpotifyClient.removeTownPlayerFromClient(coveyTownID, s.player);
    townController.removeTownListener(listener);
    townController.destroySession(s);
  });

  socket.on('chatMessage', (message: ChatMessage) => { townController.onChatMessage(message); });

  // Register an event listener for the client socket: if the client updates their
  // location, inform the CoveyTownController
  socket.on('playerMovement', (movementData: UserLocation) => {
    townController.updatePlayerLocation(s.player, movementData);
  });

  socket.on('playerSongRequest', async (songData: SongData) => {
    await townController.changePlayerSong(s.player, songData);
  });
}
