import React, { useState, useEffect, useRef, useCallback } from "react";
import Spinner from "../Spinner";

// Define an array of overflow styles that indicate that an element is scrollable
const overflowStylePatterns = ["auto", "scroll", "overlay"];

// Define a function to check if a node is an element node
function isElement(node) {
  const ELEMENT_NODE_TYPE = 1;
  return node.nodeType === ELEMENT_NODE_TYPE;
}

// Define a function to get the scrollable parent of an element
function getScrollParent(el) {
  let node = el;

  // Traverse up the DOM tree until we find a scrollable parent or reach the root
  while (node && isElement(node)) {
    if (node === document.body) {
      return window;
    }
    const { overflowY } = window.getComputedStyle(node);
    if (overflowStylePatterns.includes(overflowY)) {
      return node;
    }
    node = node.parentNode;
  }
  return window;
}

const InfiniteScroll = ({ loadMore, hasMore = true, threshold = 100 }) => {
  // Define state to keep track of whether we are currently fetching more data
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);

  // Create a ref to store the current value of the loadMore prop
  const loadMoreRef = useRef(loadMore);

  // Create a ref for the div element returned by the component
  const ref = useRef(null);

  // Update the value of the loadMoreRef ref whenever the loadMore prop changes
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // Define a function to handle scroll events
  const handleScroll = useCallback(() => {
    if (error) return;
    // Get the scrollable parent of the div element returned by the component
    const target = getScrollParent(ref.current);
    // Check if we should fetch more data
    if (
      isFetching ||
      !hasMore ||
      target.scrollHeight - target.scrollTop - target.clientHeight > threshold
    )
      return;

    // Set isFetching to true to indicate that we are fetching more data
    setIsFetching(true);
  }, [error, hasMore, isFetching, threshold]);

  const retry = () => {
    setIsFetching(true);
  };

  // Add and remove the scroll event listener when the component mounts and unmounts
  useEffect(() => {
    const target = getScrollParent(ref.current);

    target.addEventListener("scroll", handleScroll);
    return () => target.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Call the loadMore function when isFetching changes to true
  useEffect(() => {
    if (!isFetching) return;
    setError(null);
    loadMoreRef
      .current()
      .then(() => {
        setIsFetching(false);
      })
      .catch((e) => setError(e))
      .finally(() => setIsFetching(false));
  }, [isFetching]);

  return (
    <div ref={ref}>
      <InfiniteScrollContent hasMore={hasMore} failed={!!error} retry={retry} />
    </div>
  );
};

function InfiniteScrollContent({ hasMore, failed, retry }) {
  if (!hasMore) {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <span>没有了...</span>
      </div>
    );
  }
  if (failed) {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <span>
          加载失败{" "}
          <span onClick={retry} style={{ color: "var(--text-color)" }}>
            重试
          </span>
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <Spinner />
    </div>
  );
}

export default InfiniteScroll;
