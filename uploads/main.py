# ============================================
# DSAWebLectures: Queue Implementation in Python
# Topic: Linear Queue using Nodes (Linked List)
# ============================================

class Node:
    """A node in the linked list representing the queue."""
    def __init__(self, data):
        self.data = data
        self.next = None


class Queue:
    """A queue implemented using linked list nodes."""
    def __init__(self):
        self.front = None
        self.rear = None

    def is_empty(self):
        """Check if the queue is empty."""
        return self.front is None

    def enqueue(self, data):
        """Add an element to the rear of the queue."""
        new_node = Node(data)
        if self.rear is None:
            # Queue is empty, so front and rear are the same
            self.front = self.rear = new_node
            print(f"Enqueued: {data} (first element)")
            return
        # Link the new node to the end of the queue
        self.rear.next = new_node
        self.rear = new_node
        print(f"Enqueued: {data}")

    def dequeue(self):
        """Remove and return the front element of the queue."""
        if self.is_empty():
            print("Queue is empty. Cannot dequeue.")
            return None
        removed_data = self.front.data
        self.front = self.front.next

        # If the queue becomes empty
        if self.front is None:
            self.rear = None

        print(f"Dequeued: {removed_data}")
        return removed_data

    def peek(self):
        """Return the front element without removing it."""
        if self.is_empty():
            print("Queue is empty. Nothing to peek.")
            return None
        return self.front.data

    def display(self):
        """Display all elements in the queue."""
        if self.is_empty():
            print("Queue is empty.")
            return
        temp = self.front
        print("Queue contents:", end=" ")
        while temp:
            print(temp.data, end=" -> ")
            temp = temp.next
        print("None")


# ============================================
# Circular Queue Implementation
# ============================================

class CircularQueue:
    """A circular queue implemented using a list."""
    def __init__(self, size):
        self.size = size
        self.queue = [None] * size
        self.front = self.rear = -1

    def is_full(self):
        return (self.rear + 1) % self.size == self.front

    def is_empty(self):
        return self.front == -1

    def enqueue(self, data):
        if self.is_full():
            print("Circular Queue is full.")
            return
        if self.is_empty():
            self.front = 0
        self.rear = (self.rear + 1) % self.size
        self.queue[self.rear] = data
        print(f"Enqueued (Circular): {data}")

    def dequeue(self):
        if self.is_empty():
            print("Circular Queue is empty.")
            return None
        removed = self.queue[self.front]
        if self.front == self.rear:
            # Queue becomes empty
            self.front = self.rear = -1
        else:
            self.front = (self.front + 1) % self.size
        print(f"Dequeued (Circular): {removed}")
        return removed

    def display(self):
        if self.is_empty():
            print("Circular Queue is empty.")
            return
        print("Circular Queue contents:", end=" ")
        i = self.front
        while True:
            print(self.queue[i], end=" ")
            if i == self.rear:
                break
            i = (i + 1) % self.size
        print()


# ============================================
# Example Usage
# ============================================

if __name__ == "__main__":
    print("=== Linear Queue (Node-Based) ===")
    q = Queue()
    q.enqueue(10)
    q.enqueue(20)
    q.enqueue(30)
    q.display()
    q.dequeue()
    q.display()

    print("\n=== Circular Queue ===")
    cq = CircularQueue(5)
    cq.enqueue(1)
    cq.enqueue(2)
    cq.enqueue(3)
    cq.display()
    cq.dequeue()
    cq.display()
