import { nanoid } from 'nanoid';
import { mock, mockDeep, mockReset } from 'jest-mock-extended';
import { Socket } from 'socket.io';
import TwilioVideo from './TwilioVideo';
import Player, { SongData } from '../types/Player';
import CoveyTownController from './CoveyTownController';
import CoveyTownListener from '../types/CoveyTownListener';
import { UserLocation } from '../CoveyTypes';
import PlayerSession from '../types/PlayerSession';
import { townSubscriptionHandler } from '../requestHandlers/CoveyTownRequestHandlers';
import CoveyTownsStore from './CoveyTownsStore';
import * as TestUtils from '../client/TestUtils';
import SpotifyClient from './SpotifyClient';

jest.useFakeTimers();

const mockTwilioVideo = mockDeep<TwilioVideo>();
jest.spyOn(TwilioVideo, 'getInstance').mockReturnValue(mockTwilioVideo);

const mockSpotifyClient = mockDeep<SpotifyClient>();
jest.spyOn(SpotifyClient, 'getInstance').mockReturnValue(mockSpotifyClient);

function generateTestLocation(): UserLocation {
  return {
    rotation: 'back',
    moving: Math.random() < 0.5,
    x: Math.floor(Math.random() * 100),
    y: Math.floor(Math.random() * 100),
  };
}

describe('CoveyTownController', () => {
  beforeEach(() => {
    mockTwilioVideo.getTokenForTown.mockClear();
  });
  it('constructor should set the friendlyName property', () => { 
    const townName = `FriendlyNameTest-${nanoid()}`;
    const townController = new CoveyTownController(townName, false);
    expect(townController.friendlyName)
      .toBe(townName);
  });
  describe('addPlayer', () => { 
    it('should use the coveyTownID and player ID properties when requesting a video token',
      async () => {
        const townName = `FriendlyNameTest-${nanoid()}`;
        const townController = new CoveyTownController(townName, false);
        const newPlayerSession = await townController.addPlayer(new Player(nanoid()));
        expect(mockTwilioVideo.getTokenForTown).toBeCalledTimes(1);
        expect(mockTwilioVideo.getTokenForTown).toBeCalledWith(townController.coveyTownID, newPlayerSession.player.id);
      });
  });
  describe('town listeners and events', () => {
    let testingTown: CoveyTownController;
    const mockListeners = [mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>()];
    beforeEach(() => {
      const townName = `town listeners and events tests ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      mockListeners.forEach(mockReset);
    });
    it('should notify added listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);
      const newLocation = generateTestLocation();
      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.updatePlayerLocation(player, newLocation);
      mockListeners.forEach(listener => expect(listener.onPlayerMoved).toBeCalledWith(player));
    });
    it('should notify added listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.destroySession(session);
      mockListeners.forEach(listener => expect(listener.onPlayerDisconnected).toBeCalledWith(player));
    });
    it('should notify added listeners of new players when addPlayer is called', async () => {
      mockListeners.forEach(listener => testingTown.addTownListener(listener));

      const player = new Player('test player');
      await testingTown.addPlayer(player);
      mockListeners.forEach(listener => expect(listener.onPlayerJoined).toBeCalledWith(player));
    });
    it('should notify added listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.disconnectAllPlayers();
      mockListeners.forEach(listener => expect(listener.onTownDestroyed).toBeCalled());
    });
    it('should notify added listeners of player song updates when updatePlayerSongs is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      await testingTown.updatePlayerSongs();
      mockListeners.forEach(listener => expect(listener.onPlayerSongUpdated).toBeCalledWith(player));
    });
    it('should notify added listeners of player song updates when changePlayerSong is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      const testSong: SongData = {
        displayTitle: 'Testing Song by Tests',
        uris: [ 'spotify:track:t35t1ng123ur1' ],
        progress: 2000,
      };

      jest.spyOn(SpotifyClient, 'startUserPlayback').mockResolvedValueOnce(true);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      await testingTown.changePlayerSong(player, testSong);
      mockListeners.forEach(listener => expect(listener.onPlayerSongUpdated).toBeCalledWith(player));
    });
    it('should not notify added listeners of player song updates when changePlayerSong is called'
    + ' and triggers an unsuccessful Spotify API call', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      const testSong: SongData = {
        displayTitle: 'Testing Song by Tests',
        uris: [ 'spotify:track:t35t1ng123ur1' ],
        progress: 2000,
      };

      jest.spyOn(SpotifyClient, 'startUserPlayback').mockResolvedValueOnce(false);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      await testingTown.changePlayerSong(player, testSong);
      mockListeners.forEach(listener => expect(listener.onPlayerSongUpdated).not.toBeCalled());
    });
    it('should not notify removed listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const newLocation = generateTestLocation();
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.updatePlayerLocation(player, newLocation);
      expect(listenerRemoved.onPlayerMoved).not.toBeCalled();
    });
    it('should not notify removed listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerDisconnected).not.toBeCalled();
    });
    it('should not notify removed listeners of new players when addPlayer is called', async () => {
      const player = new Player('test player');

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      const session = await testingTown.addPlayer(player);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerJoined).not.toBeCalled();
    });
    it('should not notify removed listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.disconnectAllPlayers();
      expect(listenerRemoved.onTownDestroyed).not.toBeCalled();
    });
    it('should not notify removed listeners of player song updates when updatePlayerSongs is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      await testingTown.updatePlayerSongs();
      expect(listenerRemoved.onPlayerSongUpdated).not.toBeCalled();
    });
    it('should not notify removed listeners of player song updates when changePlayerSong is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      const testSong: SongData = {
        displayTitle: 'Testing Song by Tests',
        uris: [ 'spotify:track:t35t1ng123ur1' ],
        progress: 2000,
      };

      jest.spyOn(SpotifyClient, 'startUserPlayback').mockResolvedValueOnce(true);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      await testingTown.changePlayerSong(player, testSong);
      expect(listenerRemoved.onPlayerSongUpdated).not.toBeCalled();
    });
  });
  describe('townSubscriptionHandler', () => {
    const mockSocket = mock<Socket>();
    let testingTown: CoveyTownController;
    let player: Player;
    let session: PlayerSession;
    beforeEach(async () => {
      const townName = `connectPlayerSocket tests ${nanoid()}`;
      testingTown = await CoveyTownsStore.getInstance().createTown(townName, false);
      mockReset(mockSocket);
      player = new Player('test player');
      session = await testingTown.addPlayer(player);
    });
    it('should reject connections with invalid town IDs by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(nanoid(), session.sessionToken, mockSocket);
      await townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    it('should reject connections with invalid session tokens by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, nanoid(), mockSocket);
      await townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    describe('with a valid session token', () => {
      it('should add a town listener, which should emit "newPlayer" to the socket when a player joins', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        await townSubscriptionHandler(mockSocket);
        await testingTown.addPlayer(player);
        expect(mockSocket.emit).toBeCalledWith('newPlayer', player);
      });
      it('should add a town listener, which should emit "playerMoved" to the socket when a player moves', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        await townSubscriptionHandler(mockSocket);
        testingTown.updatePlayerLocation(player, generateTestLocation());
        expect(mockSocket.emit).toBeCalledWith('playerMoved', player);

      });
      it('should add a town listener, which should emit "playerDisconnect" to the socket when a player disconnects', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        await townSubscriptionHandler(mockSocket);
        testingTown.destroySession(session);
        expect(mockSocket.emit).toBeCalledWith('playerDisconnect', player);
      });
      it('should add a town listener, which should emit "townClosing" to the socket and disconnect it when disconnectAllPlayers is called', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        await townSubscriptionHandler(mockSocket);
        testingTown.disconnectAllPlayers();
        expect(mockSocket.emit).toBeCalledWith('townClosing');
        expect(mockSocket.disconnect).toBeCalledWith(true);
      });
      describe('when a socket disconnect event is fired', () => {
        it('should remove the town listener for that socket, and stop sending events to it', async () => {
          TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
          await townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            const newPlayer = new Player('should not be notified');
            await testingTown.addPlayer(newPlayer);
            expect(mockSocket.emit).not.toHaveBeenCalledWith('newPlayer', newPlayer);
          } else {
            fail('No disconnect handler registered');
          }
        });
        it('should destroy the session corresponding to that socket', async () => {
          TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
          await townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            mockReset(mockSocket);
            TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
            await townSubscriptionHandler(mockSocket);
            expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
          } else {
            fail('No disconnect handler registered');
          }

        });
      });
      it('should forward playerMovement events from the socket to subscribed listeners', async () => {
        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        await townSubscriptionHandler(mockSocket);
        const mockListener = mock<CoveyTownListener>();
        testingTown.addTownListener(mockListener);
        // find the 'playerMovement' event handler for the socket, which should have been registered after the socket was connected
        const playerMovementHandler = mockSocket.on.mock.calls.find(call => call[0] === 'playerMovement');
        if (playerMovementHandler && playerMovementHandler[1]) {
          const newLocation = generateTestLocation();
          player.location = newLocation;
          playerMovementHandler[1](newLocation);
          expect(mockListener.onPlayerMoved).toHaveBeenCalledWith(player);
        } else {
          fail('No playerMovement handler registered');
        }
      });
      it('should forward playerSongRequest events from the socket to subscribed listeners', async () => {
        jest.spyOn(SpotifyClient, 'startUserPlayback').mockResolvedValueOnce(true);

        TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, session.sessionToken, mockSocket);
        await townSubscriptionHandler(mockSocket);
        const mockListener = mock<CoveyTownListener>();
        testingTown.addTownListener(mockListener);
        // find the 'playerSongRequest' event handler for the socket, which should have been registered after the socket was connected
        const playerSongRequestHandler = mockSocket.on.mock.calls.find(call => call[0] === 'playerSongRequest');
        if (playerSongRequestHandler && playerSongRequestHandler[1]) {
          const newSong = {
            displayTitle: `Random Title by ${Math.random()}`,
            uris: [ `spotify:track${Math.random()}` ],
            progress: Math.floor(Math.random() * 100),
          };
          player.spotifySong = newSong;
          await playerSongRequestHandler[1](newSong);
          expect(mockListener.onPlayerSongUpdated).toHaveBeenCalledWith(player);
        } else {
          fail('No playerSongRequest handler registered');
        }
      });
    });
  });
  describe('addConversationArea', () => {
    let testingTown: CoveyTownController;
    beforeEach(() => {
      const townName = `addConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
    });
    it('should add the conversation area to the list of conversation areas', ()=>{
      const newConversationArea = TestUtils.createConversationForTesting();
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);
      const areas = testingTown.conversationAreas;
      expect(areas.length).toEqual(1);
      expect(areas[0].label).toEqual(newConversationArea.label);
      expect(areas[0].topic).toEqual(newConversationArea.topic);
      expect(areas[0].boundingBox).toEqual(newConversationArea.boundingBox);
    });
  });
  describe('updatePlayerLocation', () =>{
    let testingTown: CoveyTownController;
    beforeEach(() => {
      const townName = `updatePlayerLocation test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
    });
    it('should respect the conversation area reported by the player userLocation.conversationLabel, and not override it based on the player\'s x,y location', async ()=>{
      const newConversationArea = TestUtils.createConversationForTesting({ boundingBox: { x: 10, y: 10, height: 5, width: 5 } });
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);
      const player = new Player(nanoid());
      await testingTown.addPlayer(player);

      const newLocation:UserLocation = { moving: false, rotation: 'front', x: 25, y: 25, conversationLabel: newConversationArea.label };
      testingTown.updatePlayerLocation(player, newLocation);
      expect(player.activeConversationArea?.label).toEqual(newConversationArea.label);
      expect(player.activeConversationArea?.topic).toEqual(newConversationArea.topic);
      expect(player.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);

      const areas = testingTown.conversationAreas;
      expect(areas[0].occupantsByID.length).toBe(1);
      expect(areas[0].occupantsByID[0]).toBe(player.id);

    }); 
    it('should emit an onConversationUpdated event when a conversation area gets a new occupant', async () =>{
      const newConversationArea = TestUtils.createConversationForTesting({ boundingBox: { x: 10, y: 10, height: 5, width: 5 } });
      const result = testingTown.addConversationArea(newConversationArea);
      expect(result).toBe(true);

      const mockListener = mock<CoveyTownListener>();
      testingTown.addTownListener(mockListener);

      const player = new Player(nanoid());
      await testingTown.addPlayer(player);
      const newLocation:UserLocation = { moving: false, rotation: 'front', x: 25, y: 25, conversationLabel: newConversationArea.label };
      testingTown.updatePlayerLocation(player, newLocation);
      expect(mockListener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
    });
  });
  describe('updatePlayerSongs', () => {
    jest.mock('./SpotifyClient');
    let testingTown: CoveyTownController;
    let player1: Player;
    let player2: Player;
    let testSong: SongData;
    beforeEach(async () => {
      const townName = `updatePlayerSongs test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      player1 = new Player('test player 1');
      player2 = new Player('test player 2');

      testSong = {
        displayTitle: 'Testing Song by Tests',
        uris: [ 'spotify:track:t35t1ng123ur1' ],
        progress: 2000,
      };

      SpotifyClient.addTownToClient(testingTown.coveyTownID);

      await testingTown.addPlayer(player1);
      await testingTown.addPlayer(player2);

      SpotifyClient.addTownPlayerToClient(testingTown.coveyTownID, player1, '{"access_token":"test_token_1", "expiry":3600}');
      SpotifyClient.addTownPlayerToClient(testingTown.coveyTownID, player2, '{"access_token":"test_token_2", "expiry":3600}');
    });
    afterAll(() => {
      jest.clearAllMocks();
    });
    it('should call getCurrentPlayingSong the proper number of times', async () => {
      const spiedOnMethod = jest.spyOn(SpotifyClient, 'getCurrentPlayingSong').mockResolvedValue(undefined);

      await testingTown.updatePlayerSongs();

      // called once per player
      expect(spiedOnMethod).toBeCalledTimes(2);

      await testingTown.updatePlayerSongs();

      // called once per player per updatePlayerSongs call
      expect(spiedOnMethod).toBeCalledTimes(4);
    });
    it('should call getPlaybackState the proper number of times', async () => {
      const spiedOnMethod = jest.spyOn(SpotifyClient, 'getPlaybackState');

      await testingTown.updatePlayerSongs();

      expect(SpotifyClient.getPlaybackState).toBeCalledTimes(2);

      await testingTown.updatePlayerSongs();

      expect(spiedOnMethod).toBeCalledTimes(4);
    });
    it('should update a player\'s song if a song is currently playing', async () => {
      jest.spyOn(SpotifyClient, 'getCurrentPlayingSong').mockResolvedValue(testSong);
      jest.spyOn(SpotifyClient, 'getPlaybackState').mockResolvedValue({ isPlaying: true });

      expect(player1.spotifySong).toBeUndefined();
      expect(player2.spotifySong).toBeUndefined();

      await testingTown.updatePlayerSongs();

      expect(player1.spotifySong).toMatchObject(testSong);
      expect(player2.spotifySong).toMatchObject(testSong);
    });
    it('should set a player\'s song to undefined if no song is currently playing', async () => {
      jest.spyOn(SpotifyClient, 'getCurrentPlayingSong').mockResolvedValue(undefined);
      jest.spyOn(SpotifyClient, 'getPlaybackState').mockResolvedValue({ isPlaying: false });

      expect(player1.spotifySong).toBeUndefined();
      expect(player2.spotifySong).toBeUndefined();

      await testingTown.updatePlayerSongs();

      expect(player1.spotifySong).toBeUndefined();
      expect(player2.spotifySong).toBeUndefined();
    });
    it('should set a player\'s song to undefined if a song is paused', async () => {
      jest.spyOn(SpotifyClient, 'getCurrentPlayingSong').mockResolvedValue(testSong);
      jest.spyOn(SpotifyClient, 'getPlaybackState').mockResolvedValue({ isPlaying: false });

      expect(player1.spotifySong).toBeUndefined();
      expect(player2.spotifySong).toBeUndefined();

      await testingTown.updatePlayerSongs();

      expect(player1.spotifySong).toBeUndefined();
      expect(player2.spotifySong).toBeUndefined();
    });
  });
  describe('changePlayerSong', () => {
    let testingTown: CoveyTownController;
    let player: Player;
    let testSong: SongData;
    let testSongFromStart: SongData;
    beforeEach(async () => {
      const townName = `changePlayerSong test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      player = new Player('test player');
      testSong = {
        displayTitle: 'Testing Song by Tests',
        uris: [ 'spotify:track:t35t1ng123ur1' ],
        progress: 2000,
      };
      testSongFromStart = {
        displayTitle: 'Testing Song by Tests',
        uris: [ 'spotify:track:t35t1ng123ur1' ],
        progress: 0,
      };

      await testingTown.addPlayer(player);
    });
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('calls SpotifyClient.startUserPlayback with the proper arguments', async () => {
      const spiedOnMethod = jest.spyOn(SpotifyClient, 'startUserPlayback');

      expect(spiedOnMethod).not.toBeCalled();

      await testingTown.changePlayerSong(player, testSong);

      expect(spiedOnMethod).toBeCalledTimes(1);
      expect(spiedOnMethod).toBeCalledWith(testingTown.coveyTownID, player, testSongFromStart);
    });
    it('sets the spotifySong property of a player to the desired song', async () => {
      jest.spyOn(SpotifyClient, 'startUserPlayback').mockResolvedValueOnce(true);

      expect(player.spotifySong).toBeUndefined();

      await testingTown.changePlayerSong(player, testSong);

      expect(player.spotifySong).toMatchObject(testSongFromStart);
    });
    it('does not change the spotifySong property of a player if it triggers an'
    + ' unsuccessful Spotify API call', async () => {
      jest.spyOn(SpotifyClient, 'startUserPlayback').mockResolvedValueOnce(false);

      expect(player.spotifySong).toBeUndefined();

      await testingTown.changePlayerSong(player, testSong);

      expect(player.spotifySong).toBeUndefined();
    });
  });
});
