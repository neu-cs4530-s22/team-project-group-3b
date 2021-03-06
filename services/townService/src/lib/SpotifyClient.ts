import axios from 'axios';
import dotenv from 'dotenv';
import Player, { PlaybackState, SongData } from '../types/Player';

dotenv.config();

/**
 * The format of a Spotify token, with the access token and the expiry time
 */
export interface SpotifyToken {
  /** The access token for the spotify session * */
  accessToken: string;
  /** The expiry time of the spotify token * */
  expiry: number;
}

/**
 * A wrapper object class for the Spotify API.
 * Includes functionality for making calls to the Spotify API. Support calls include:
 *  - getting basic information on a user's Spotify account
 *  - getting information on a user's currently playing track
 *  - request to the Spotify API to start playing a certain track and timestamp on a user's device
 */
export default class SpotifyClient {
  private static _instance: SpotifyClient;

  // maps coveyTownIDs to a map from Players to their spotifyTokens
  private static _townsToPlayerMaps: Map<string, Map<Player, SpotifyToken>> 
  = new Map<string, Map<Player, SpotifyToken>>();

  constructor() {
    SpotifyClient._townsToPlayerMaps = new Map<string, Map<Player, SpotifyToken>>();
  }

  public static getInstance(): SpotifyClient {
    if (!SpotifyClient._instance) {
      SpotifyClient._instance = new SpotifyClient();
    }
    return SpotifyClient._instance;
  }

  /**
   * A method for retreiving the Spotify access token corresponding to a user.
   * This is the access token required to make Spotify API calls for that user's Spotify account.
   * 
   * @param coveyTownID the coveyTownID of the town a player is currently in
   * @param player the Player object for the intended user
   * @returns a user's Spotify access token corresponding to this Player
   */
  static getTokenForTownPlayer(coveyTownID: string, player: Player): string | undefined {
    if (this) {
      const playerToToken = SpotifyClient._townsToPlayerMaps.get(coveyTownID);

      const fullToken = playerToToken?.get(player);
      const accessToken = fullToken?.accessToken;
      return accessToken;
    }
    return undefined;
  }

  /**
   * A generic method for making a GET call to the Spotify API for a user's account.
   * Allows SpotifyClient to make any Spotify API call of the GET method.
   * 
   * @param apiURL the HTTP URL destination to call
   * @param coveyTownID the coveyTownID of the town a player is currently in
   * @param player the Player object for the intended user
   * @returns the AxiosResponse returned by the call, or undefined if the call is unsuccessful
   */
  private static async getSpotifyAPICallResponse(apiURL: string, 
    coveyTownID: string, 
    player: Player) {
    const playerToken = SpotifyClient.getTokenForTownPlayer(coveyTownID, player);

    try {
      const response = await axios.get(apiURL, { 
        headers: { 
          'Authorization': `Bearer ${playerToken}`,
          'Content-Type': 'application/json',
        },
      });

      // console.log(`username: ${player.userName}, id: ${player.id}, token: ${playerToken}`);
      return response;
    } catch (err) {
      // console.log(`username: ${player.userName}, id: ${player.id}, token: ${playerToken}`);
      // console.log(err);
      return undefined;
    }
  }

  /**
   * A method to add a Covey Town to SpotifyClient's data structure.
   * Intended to be called when a town is created.
   * 
   * @param coveyTownID the coveyTownID corresponding to the town to be added
   */
  static addTownToClient(coveyTownID: string): void {
    const playerToToken = new Map<Player, SpotifyToken>();

    SpotifyClient._townsToPlayerMaps.set(coveyTownID, playerToToken);
  }

  /**
   * A method to remove a Covey Town from SpotifyClient's data structure.
   * Intended to be called when a town is destroyed.
   * 
   * @param coveyTownID the coveyTownID corresponding to the town to be removed
   */
  static removeTownFromClient(coveyTownID: string): void {
    SpotifyClient._townsToPlayerMaps.delete(coveyTownID);
  }

  /**
   * A method to add a Player to SpotifyClient's data structure.
   * Intended to be called when a Player joins a town.
   * 
   * @param coveyTownID the coveyTownID of the town a player is currently in
   * @param player the Player object for the intended user
   * @param spotifyToken the Spotify access token corresponding to the intended user
   */
  static addTownPlayerToClient(coveyTownID: string, player: Player, spotifyToken: string): void {
    const playerToToken = SpotifyClient._townsToPlayerMaps.get(coveyTownID);

    try {
      const tokenJson = JSON.parse(spotifyToken);
      const token: SpotifyToken = {
        accessToken: tokenJson.access_token,
        expiry: tokenJson.expiry,
      };
      playerToToken?.set(player, token);
    } catch {
      throw new Error(`Error parsing token "${spotifyToken}"`);
    }
  }

  /**
   * A method to remove a Player from SpotifyClient's data structure.
   * Intended to be called when a Player leaves a town.
   * 
   * @param coveyTownID the coveyTownID of the town a player is currently in
   * @param player the Player object for the intended user
   */
  static removeTownPlayerFromClient(coveyTownID: string, player: Player): void {
    const playerToToken = SpotifyClient._townsToPlayerMaps.get(coveyTownID);

    playerToToken?.delete(player);
  }

  /**
   * A method to make a call to get a user's Spotify account information.
   * Specifically parses through the API response to get a user's Spotify user ID.
   * 
   * @param coveyTownID the coveyTownID of the town a player is currently in
   * @param player the Player object for the intended user
   * @returns a user's Spotify user ID (username), or underfined if there is an error
   *          making the API call
   */
  public static async getSpotifyUserID(coveyTownID: string, player: Player): Promise<string | undefined> {
    // scope = 'user-read-private user-read-email'

    const userInfo = await SpotifyClient.getSpotifyAPICallResponse('https://api.spotify.com/v1/me', 
      coveyTownID, 
      player);

    if (userInfo) {
      const userJsonData = await userInfo.data;

      const spotifyUserID = await userJsonData.id;

      return spotifyUserID;
    }

    return undefined;
  }

  /**
   * A method to make a call to get information on a user's currently playing 
   * track on Spotify.
   * Specifically parses through the API response to get the song title and artist.
   * 
   * @param coveyTownID the coveyTownID of the town a player is currently in
   * @param player the Player object for the intended user
   * @returns a string with a user's currently playing song title and artist, or
   *          undefined if no song is currently playing (or if there is an error making the call)
   */
  public static async getCurrentPlayingSong(coveyTownID: string, player: Player): Promise<SongData | undefined> {
    // scope = 'user-read-currently-playing'

    const currentTrackInfo = 
    await SpotifyClient.getSpotifyAPICallResponse('https://api.spotify.com/v1/me/player/currently-playing',
      coveyTownID, 
      player);

    if (currentTrackInfo) {
      const currentTrackJsonData = await currentTrackInfo.data;

      if (currentTrackJsonData.item) {
        const currentTrackTitle = await currentTrackJsonData.item.name;

        const currentTrackArtist = await currentTrackJsonData.item.album.artists[0].name;

        const currentTrackDisplayTitle = `${currentTrackTitle} by ${currentTrackArtist}`;

        const currentSongUri = await currentTrackJsonData.item.uri;

        const currentTrackProgress = await currentTrackJsonData.progress_ms;

        const currentSongData: SongData = {
          displayTitle: currentTrackDisplayTitle,
          uris: [currentSongUri],
          progress: currentTrackProgress,
        };
        
        // console.log(currentTrackDisplayTitle);
        return currentSongData;
      }
    }
    
    return undefined;
  }

  /**
   * A method to make a call to start Spotify playback for a user to the Spotify API.
   * Uses an axios request of method PUT.
   * 
   * Successful response is 'Playback started'
   * 
   * @param coveyTownID the coveyTownID of the town a player is currently in
   * @param player the Player object for the intended user
   * @param songData the songData describing the song to be played
   * @returns whether or not the API call was successful
   */
  public static async startUserPlayback(coveyTownID: string, player: Player, songData: SongData): Promise<boolean> {
    // scope = 'user-modify-playback-state'

    const playerToken = SpotifyClient.getTokenForTownPlayer(coveyTownID, player);

    try {
      await axios.put('https://api.spotify.com/v1/me/player/play', 
        {
          'uris': songData.uris,
          'progress_ms': songData.progress,
        },
        { 
          headers:
            {
              'Authorization': `Bearer ${playerToken}`,
              'Content-Type': 'application/json',
            },
        },
      );
    
      return true;
    } catch (err) {
      // console.log(err);
      return false;
    }
  }

  public static async getPlaybackState(coveyTownID: string, player: Player): Promise<PlaybackState | undefined> {
    // scope = 'user-read-playback-state'
    
    const playbackStateInfo = 
    await SpotifyClient.getSpotifyAPICallResponse('https://api.spotify.com/v1/me/player',
      coveyTownID, 
      player);

    if (playbackStateInfo) {
      const playbackStateJsonData = await playbackStateInfo.data;

      if (playbackStateJsonData.item) {
        const isPlaying = await playbackStateJsonData.is_playing;

        const playbackStateData: PlaybackState = {
          isPlaying,
        };
        
        return playbackStateData;
      }
    }
    
    return undefined;
  }
  
}
