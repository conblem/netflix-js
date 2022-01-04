import React, { useEffect, useRef, useState } from "react";

function timeout(time) {
  return new Promise((resolve) => setTimeout(() => resolve("timeout"), time));
}

async function getMessageWithTimeout(socket) {
  let onmessage = undefined;
  let message = new Promise((resolve) => {
    onmessage = (event) => resolve(event.data);
    socket.addEventListener("message", onmessage);
  });

  let result = await Promise.race([message, timeout(500)]).finally(() =>
    socket.removeEventListener("message", onmessage)
  );

  if (result === "timeout") {
    return null;
  }
  return result;
}

function connect(socket) {
  let onopen = undefined;
  let onerror = undefined;

  return new Promise((resolve, reject) => {
    onopen = () => resolve(socket);
    onerror = () => reject(socket);

    socket.addEventListener("open", onopen);
    socket.addEventListener("error", onerror);
  }).finally(() => {
    socket.removeEventListener("open", onopen);
    socket.removeEventListener("error", onerror);
  });
}

async function getTime(connected, delta) {
  const socket = await connected;

  let start = new Date();

  socket.send("time");
  let server_time = await getMessageWithTimeout(socket);

  // divide by 2 so we dont get roundtrip latency
  let ws_latency = (new Date().getTime() - start.getTime()) / 2;

  delta.current = start.getTime() - server_time - ws_latency;
  console.log(delta.current, ws_latency);
}

function useTime() {
  const delta = useRef(0);

  useEffect(() => {
    const socket = new WebSocket("ws://100.95.242.113:8080/api");
    const connected = connect(socket);
    const interval = setInterval(() => getTime(connected, delta), 10000);

    () => {
      socket.close();
      clearInterval(interval);
    };
  });

  return delta;
}

export default function Video() {
  const delta = useTime();
  const playerRef = useRef(null);

  useEffect(() => {
    const player = playerRef.current;

    const hls = new Hls();
    hls.attachMedia(player);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource("http://100.95.242.113/hls/netflix.m3u8");
    });

    let clock_delay = 0;
    hls.on(Hls.Events.FRAG_PARSED, (event, data) => {
      clock_delay = new Date().getTime() - data.frag.programDateTime;
    });

    hls.on(Hls.Events.FRAG_CHANGED, (event, data) => {
      const fragment_time = new Date(data.frag.programDateTime);
      const player_delay = new Date().getTime() - fragment_time.getTime();
      // add delta current back
      const real_delay = (player_delay + clock_delay + delta.current) / 1000;

      console.log("real_delay", real_delay);
      const currentTime = player.currentTime;
      if (real_delay < 30) {
        console.log("back");
        player.currentTime = currentTime - 1;
        return;
      }
      if (real_delay > 35) {
        console.log("forward");
        player.currentTime = currentTime + 1;
        return;
      }
    });
  });

  return (
    <div>
      <video ref={playerRef} controls />
    </div>
  );
}
